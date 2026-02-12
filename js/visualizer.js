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
            const width = this.canvas.width;
            const height = this.canvas.height;
            const cx = width / 2;
            const cy = height / 2;
            const minDim = Math.min(width, height);
            // [파형 비율 조정 위치]
            // baseRadius: 파형의 기본 원 반지름 (값이 커질수록 바깥쪽)
            // amplitude: 파형 진폭 (값이 커질수록 퍼짐)
            const baseRadius = minDim * 0.3; // 기본 원 반지름 (더 큼)
            const amplitude = minDim * 0.2; // 파형 진폭 (더 큼)

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

            for (let i = 0; i < this.bufferLength; i++) {
                const theta = (i / this.bufferLength) * Math.PI * 2;
                const v = (this.dataArray[i] - 128) / 128; // -1 ~ 1
                const r = baseRadius + v * amplitude * this.gain;
                const x = r * Math.cos(theta);
                const y = r * Math.sin(theta);
                if (i === 0) {
                    this.ctx.moveTo(x, y);
                } else {
                    this.ctx.lineTo(x, y);
                }
            }
            this.ctx.closePath();
            // 그림자/글로우 없이 단순 선
            this.ctx.stroke();
            this.ctx.restore();
        };
        draw();
    }
}