export class Visualizer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.analyser = null;
        this.dataArray = null;
        this.bufferLength = null;

        // 초기값 설정
        this.gain = 4.0;      // 증폭
        this.lineWidth = 2.0; // 기본 선 굵기
        this.color = '#222'; // 기본 색상(검정)

        this.resize();
        window.addEventListener('resize', () => requestAnimationFrame(() => this.resize()));
    }

    resize() {
        const parent = this.canvas.parentElement;
        if (parent) {
            this.canvas.width = parent.clientWidth;
            this.canvas.height = parent.clientHeight;
        }
    }

    connect(analyser) {
        this.analyser = analyser;
        this.analyser.fftSize = 2048;
        this.bufferLength = this.analyser.frequencyBinCount;
        this.dataArray = new Uint8Array(this.bufferLength);
    }

    // [중요] 선 굵기 변경 기능 추가
    setLineWidth(value) {
        this.lineWidth = value;
    }

    // 증폭 변경 기능
    setGain(value) {
        this.gain = value;
    }

    // 색상 변경 기능
    setColor(color) {
        this.color = color;
    }

    start() {
        const draw = () => {
            requestAnimationFrame(draw);
            if (!this.analyser) return;

            this.analyser.getByteTimeDomainData(this.dataArray);
            // 이동평균으로 데이터 부드럽게 처리
            function smoothData(data, windowSize = 4) {
                const result = [];
                for (let i = 0; i < data.length; i++) {
                    let sum = 0;
                    let count = 0;
                    for (let j = -Math.floor(windowSize / 2); j <= Math.floor(windowSize / 2); j++) {
                        if (data[i + j] !== undefined) {
                            sum += data[i + j];
                            count++;
                        }
                    }
                    result.push(sum / count);
                }
                return result;
            }
            const smoothArray = smoothData(this.dataArray);
            const width = this.canvas.width;
            const height = this.canvas.height;
            const cx = width / 2;
            const cy = height / 2;
            const minDim = Math.min(width, height);
            // [파형 비율 조정 위치]
            // baseRadius: 파형의 기본 원 반지름 (값이 커질수록 바깥쪽)
            // amplitude: 파형 진폭 (값이 커질수록 퍼짐)
            const baseRadius = minDim * 0.31; // 더 큰 원 반지름
            const amplitude = minDim * 0.19; // 더 작은 진폭
            this.gain = 3.2; // 더 작은 증폭

            // 배경만 깔끔하게 덮기 (잔상/글로우 없음)
            this.ctx.globalAlpha = 1.0;
            this.ctx.fillStyle = '#222';
            this.ctx.fillRect(0, 0, width, height);

            this.ctx.save();
            this.ctx.translate(cx, cy);
            this.ctx.rotate(-Math.PI / 2); // 12시 방향 시작

            this.ctx.beginPath();
            this.ctx.lineWidth = this.lineWidth;
            this.ctx.strokeStyle = this.color;

            // Catmull-Rom Spline for smooth circular interpolation
            function getCatmullRomPoint(p0, p1, p2, p3, t) {
                const t2 = t * t;
                const t3 = t2 * t;
                return (
                    0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
                );
            }
            // Prepare points
            const points = [];
            // [추가] 양 끝 10% 영역만 스무딩 처리
            const fadeRatio = 0.0089;
            const fadeLength = Math.floor(this.bufferLength * fadeRatio);

            for (let i = 0; i < this.bufferLength; i++) {
                const theta = (i / this.bufferLength) * Math.PI * 2;

                // 1. 기존 파형 진폭 계산
                let v = (smoothArray[i] - 128) / 128;

                // 2. [수정] 튜키 윈도우(Tukey Window) 적용: 양 끝부분만 페이드인/페이드아웃
                let windowMultiplier = 1.0; // 기본적으로는 진폭을 100% 유지

                if (i < fadeLength) {
                    // 12시 기준 오른쪽(시작) 부분 부드럽게 올리기
                    windowMultiplier = 0.5 * (1 - Math.cos((Math.PI * i) / fadeLength));
                } else if (i > this.bufferLength - 1 - fadeLength) {
                    // 12시 기준 왼쪽(끝) 부분 부드럽게 내리기
                    const distFromEnd = this.bufferLength - 1 - i;
                    windowMultiplier = 0.5 * (1 - Math.cos((Math.PI * distFromEnd) / fadeLength));
                }

                v = v * windowMultiplier;

                const r = baseRadius + v * amplitude * this.gain;
                points.push({
                    x: r * Math.cos(theta),
                    y: r * Math.sin(theta)
                });
            }
            // Draw Catmull-Rom spline
            this.ctx.moveTo(points[0].x, points[0].y);
            for (let i = 0; i < points.length; i++) {
                // Circular indexing for seamless loop
                const p0 = points[(i - 1 + points.length) % points.length];
                const p1 = points[i];
                const p2 = points[(i + 1) % points.length];
                const p3 = points[(i + 2) % points.length];
                for (let t = 0; t < 1; t += 0.2) {
                    const x = getCatmullRomPoint(p0.x, p1.x, p2.x, p3.x, t);
                    const y = getCatmullRomPoint(p0.y, p1.y, p2.y, p3.y, t);
                    this.ctx.lineTo(x, y);
                }
            }
            this.ctx.closePath();
            this.ctx.stroke();
            this.ctx.restore();
        };
        draw();
    }
}