export class AudioEngine {
    constructor() {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.5;

        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 2048;

        // [신호 경로] 소스 -> 게인 -> 분석기 -> 스피커
        this.masterGain.connect(this.analyser);
        this.analyser.connect(this.ctx.destination);

        this.params = {
            pitch: 1.0,
            decay: 0.3,
            type: 'sine'
        };

        // 한글 매핑 주파수 (Hz)
        this.consonantFreq = {
            'ㄱ': 220, 'ㄲ': 240, 'ㄴ': 260, 'ㄷ': 280, 'ㄸ': 300,
            'ㄹ': 320, 'ㅁ': 340, 'ㅂ': 360, 'ㅃ': 380, 'ㅅ': 400,
            'ㅆ': 420, 'ㅇ': 440, 'ㅈ': 460, 'ㅉ': 480, 'ㅊ': 500,
            'ㅋ': 520, 'ㅌ': 540, 'ㅍ': 560, 'ㅎ': 580
        };
        this.vowelFreq = {
            'ㅏ': 550, 'ㅐ': 570, 'ㅑ': 590, 'ㅒ': 610, 'ㅓ': 630,
            'ㅔ': 650, 'ㅕ': 670, 'ㅖ': 690, 'ㅗ': 710, 'ㅘ': 730,
            'ㅙ': 750, 'ㅚ': 770, 'ㅛ': 790, 'ㅜ': 810, 'ㅝ': 830,
            'ㅞ': 850, 'ㅟ': 870, 'ㅠ': 890, 'ㅡ': 910, 'ㅢ': 930,
            'ㅣ': 950
        };
    }

    resume() {
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    // 한글 자소 분리 (단순화 버전)
    decomposeHangul(char) {
        const code = char.charCodeAt(0) - 44032;
        if (code < 0 || code > 11171) return [char];

        const initial = Math.floor(code / 588);
        const medial = Math.floor((code % 588) / 28);
        const final = code % 28;

        const initials = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
        const medials = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ'];
        const finals = ['', 'ㄱ', 'ㄲ', 'gs', 'ㄴ', 'nj', 'nh', 'ㄷ', 'ㄹ', 'rk', 'rm', 'rb', 'rs', 'rt', 'rp', 'rh', 'ㅁ', 'ㅂ', 'bs', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

        const result = [initials[initial], medials[medial]];
        if (final !== 0) result.push(finals[final]);

        return result;
    }

    // 일반 ASCII 문자 재생
    playTone(charCode) {
        // 주파수 범위 제한 (너무 높거나 낮은 소리 방지)
        const freq = Math.max(100, Math.min(2000, charCode * 5 * this.params.pitch));
        this.triggerOscillator(freq, this.params.decay);
    }

    // 한글 재생
    playToneHangul(char) {
        const components = this.decomposeHangul(char);
        const now = this.ctx.currentTime;
        let delay = 0;

        components.forEach((comp) => {
            let freq = 440;
            let decay = this.params.decay;

            if (this.consonantFreq[comp]) {
                freq = this.consonantFreq[comp] * this.params.pitch;
                decay = 0.1; // 자음은 짧게
            } else if (this.vowelFreq[comp]) {
                freq = this.vowelFreq[comp] * this.params.pitch;
                decay = decay + 0.1; // 모음은 조금 더 길게
            } else {
                return; // 매핑 안 된 문자는 패스
            }

            // 오실레이터 실행 (Visualizer 호출 코드 제거됨)
            this.triggerOscillator(freq, decay, delay);
            delay += 0.05; // 자소 간 약간의 시차
        });
    }

    // 실제 소리를 만드는 내부 함수
    triggerOscillator(freq, decay, delay = 0) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const now = this.ctx.currentTime + delay;

        osc.type = this.params.type;
        osc.frequency.setValueAtTime(freq, now);

        // 엔벨로프 (Volume Envelope)
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.3, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + decay);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + decay + 0.1);

        // 가비지 컬렉션을 위해 연결 해제 (메모리 누수 방지)
        setTimeout(() => {
            osc.disconnect();
            gain.disconnect();
        }, (decay + 0.2) * 1000);
    }
}