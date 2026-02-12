import { AudioEngine } from './audio.js';
import { Visualizer } from './visualizer.js';

// --- 1. 초기화 ---
const audio = new AudioEngine();
const visualizer = new Visualizer('visualizer');

const textInput = document.getElementById('text-input');
const transmitBtn = document.getElementById('transmit-btn');
const led = document.querySelector('.led');

const pitchInput = document.getElementById('pitch');
const decayInput = document.getElementById('decay');
const thicknessInput = document.getElementById('thickness');
// gainInput은 내부 제어하므로 변수 선언 불필요

const btnText = transmitBtn ? transmitBtn.querySelector('span') : null;
const btnIcon = transmitBtn ? transmitBtn.querySelector('i') : null;

let isPlaying = false;
let stopSignal = false;

// --- 2. 분위기(Mood) 프리셋 ---
const MOOD_PRESETS = {
    nature: {
        id: 'nature', // 카운팅을 위해 ID 추가
        keywords: ['바람', '숲', '나무', '하늘', '구름', '사랑', '자연', '잔잔', 'flow', 'green', 'sky', 'wind', 'love', 'peace'],
        color: '#a3d4a3ff', waveType: 'sine'
    },
    danger: {
        id: 'danger',
        keywords: ['경고', '위험', '에러', '파괴', '공포', '긴급', 'error', 'warning', 'danger', 'red', 'kill', 'fire', 'critical'],
        color: '#c93c18ff', waveType: 'sawtooth'
    },
    tech: {
        id: 'tech',
        keywords: ['시스템', '데이터', '분석', '로봇', '작동', 'system', 'data', 'code', 'tech', 'blue', 'ok', 'logic'],
        color: '#5a9494ff', waveType: 'square'
    },
    sad: {
        id: 'sad',
        keywords: ['슬픔', '눈물', '이별', '고통', '우울', 'sad', 'cry', 'tear', 'pain', 'grief', 'alone'],
        color: '#5050b8ff', waveType: 'triangle'
    }
};

const DEFAULT_MOOD = { color: '#fdfdfdff', waveType: 'sine' };

// --- 3. 분위기 분석 엔진 ---

// (A) 실시간 입력용: 마지막 단어만 봄
function detectInstantMood(text) {
    if (!text || text.trim() === "") return DEFAULT_MOOD;
    const tokens = text.toLowerCase().split(/[\s,.?!]+/);
    const lastWord = tokens.filter(t => t.length > 0).pop();

    if (!lastWord) return DEFAULT_MOOD;

    for (const preset of Object.values(MOOD_PRESETS)) {
        if (preset.keywords.some(k => lastWord.includes(k))) {
            return preset;
        }
    }
    return DEFAULT_MOOD;
}

// (B) 전송용: 전체 텍스트 분석 (가장 많이 나온 분위기 찾기)
function analyzeOverallMood(fullText) {
    if (!fullText || fullText.trim() === "") return DEFAULT_MOOD;

    const tokens = fullText.toLowerCase().split(/[\s,.?!]+/);

    // 점수판 초기화
    let scores = { nature: 0, danger: 0, tech: 0, sad: 0 };
    let totalHits = 0;

    // 전체 단어 스캔
    tokens.forEach(word => {
        if (!word) return;
        for (const [key, preset] of Object.entries(MOOD_PRESETS)) {
            if (preset.keywords.some(k => word.includes(k))) {
                scores[key]++;
                totalHits++;
            }
        }
    });

    if (totalHits === 0) return DEFAULT_MOOD; // 키워드가 하나도 없으면 기본값

    // 가장 높은 점수의 분위기 찾기
    let maxScore = -1;
    let winnerKey = null;

    for (const [key, score] of Object.entries(scores)) {
        if (score > maxScore) {
            maxScore = score;
            winnerKey = key;
        }
    }

    return MOOD_PRESETS[winnerKey] || DEFAULT_MOOD;
}


function applyMoodToEngine(mood) {
    visualizer.setColor(mood.color);
    audio.params.type = mood.waveType;
}

// --- 4. 이벤트 리스너 ---
document.addEventListener('DOMContentLoaded', () => {

    if (pitchInput) audio.params.pitch = parseFloat(pitchInput.value);

    if (decayInput) decayInput.addEventListener('input', (e) => audio.params.decay = parseFloat(e.target.value));
    if (thicknessInput) thicknessInput.addEventListener('input', (e) => visualizer.setLineWidth(parseFloat(e.target.value)));
    if (pitchInput) pitchInput.addEventListener('input', (e) => audio.params.pitch = parseFloat(e.target.value));

    document.body.addEventListener('click', () => audio.resume(), { once: true });
    if (visualizer && audio.analyser) {
        visualizer.connect(audio.analyser);
        visualizer.start();
    }

    // 텍스트 입력 (실시간 반응: 마지막 단어 기준)
    if (textInput) {
        textInput.addEventListener('input', (e) => {
            const fullText = textInput.value;

            // 1. 입력 중에는 '직전 단어'에 반응 (Preview)
            const liveMood = detectInstantMood(fullText);
            applyMoodToEngine(liveMood);

            if (e.inputType !== 'deleteContentBackward' && e.inputType !== 'deleteContentForward') {
                const lastChar = e.data || fullText.slice(-1);
                if (lastChar && lastChar.trim() !== '') {
                    audio.resume();

                    // [타이핑 모드: 약하고 짧게]
                    const originalDecay = audio.params.decay;
                    audio.params.decay = 0.1;
                    visualizer.setGain(0.5);

                    if (/[가-힣]/.test(lastChar)) audio.playToneHangul(lastChar);
                    else audio.playTone(lastChar.charCodeAt(0));

                    triggerLed(true);

                    setTimeout(() => { audio.params.decay = originalDecay; }, 50);
                }
            }
        });
    }

    if (transmitBtn) {
        transmitBtn.addEventListener('click', handleTransmit);
    }
});


// --- 5. 전송 및 재생 로직 ---

function handleTransmit() {
    audio.resume();
    if (isPlaying) {
        stopSequence();
    } else {
        if (!textInput) return;
        const rawInput = textInput.value.trim();
        if (!rawInput) return;

        try {
            const jsonData = JSON.parse(rawInput);
            if (Array.isArray(jsonData)) {
                startSequenceJSON(jsonData);
                return;
            }
        } catch (e) { }

        startSmartSequence(rawInput);
    }
}

// 스마트 시퀀서 (전체 분석 모드)
async function startSmartSequence(fullText) {
    isPlaying = true;
    stopSignal = false;
    updateUIState(true);

    // [핵심 변경] 재생 시작 전, 전체 텍스트를 분석하여 '지배적인 분위기' 결정
    const dominantMood = analyzeOverallMood(fullText);

    // 결정된 분위기를 적용 (전송 내내 유지됨)
    applyMoodToEngine(dominantMood);

    // 콘솔에 어떤 모드로 전송되는지 찍어봄 (디버깅용)
    console.log("Transmitting Mode:", dominantMood.id || "Default");

    const segments = fullText.split(/([.?!]+|\n|\s+)/);

    for (const segment of segments) {
        if (stopSignal) break;
        if (segment.length === 0) continue;

        // **참고**: 여기서 detectMood(segment)를 호출하지 않음으로써
        // 중간에 단어가 바뀌어도 색상이 변하지 않고 '전체 분위기'를 유지함.

        const chars = segment.split('');

        for (let i = 0; i < chars.length; i++) {
            if (stopSignal) break;
            const char = chars[i];

            if (char !== ' ' && char !== '\n') {
                // [전송 모드: 강하고 길게]
                visualizer.setGain(3.0);

                if (decayInput) audio.params.decay = parseFloat(decayInput.value);
                if (thicknessInput) visualizer.setLineWidth(parseFloat(thicknessInput.value));

                if (/[가-힣]/.test(char)) audio.playToneHangul(char);
                else audio.playTone(char.charCodeAt(0));

                triggerLed(false);
            }

            let delay = getDelay(char);
            await new Promise(r => setTimeout(r, delay));
        }

        if (['.', '!', '?', '\n'].includes(segment)) {
            await new Promise(r => setTimeout(r, 300));
        }
    }
    stopSequence();
}

// JSON 모드 (기존 유지)
async function startSequenceJSON(dataArray) {
    isPlaying = true;
    stopSignal = false;
    updateUIState(true);

    for (const [index, segment] of dataArray.entries()) {
        if (stopSignal) break;
        if (btnText) btnText.textContent = `PLAYING ${index + 1} / ${dataArray.length}`;

        if (segment.color) visualizer.setColor(segment.color);
        const speedMultiplier = segment.tempo || 1.0;
        const text = segment.text || "";

        for (let i = 0; i < text.length; i++) {
            if (stopSignal) break;
            const char = text[i];
            if (char !== ' ' && char !== '\n') {
                visualizer.setGain(5.0);
                if (decayInput) audio.params.decay = parseFloat(decayInput.value);
                if (/[가-힣]/.test(char)) audio.playToneHangul(char);
                else audio.playTone(char.charCodeAt(0));
                triggerLed(false);
            }
            let delay = getDelay(char) / speedMultiplier;
            await new Promise(r => setTimeout(r, delay));
        }
        await new Promise(r => setTimeout(r, 300));
    }
    stopSequence();
}

function getDelay(char) {
    if (['.', ',', '!', '?'].includes(char)) return 500;
    if (char === ' ') return 200;
    if (char === '\n') return 400;
    return 150;
}

function updateUIState(isTransmitting) {
    if (!textInput || !transmitBtn) return;
    if (isTransmitting) {
        textInput.disabled = true;
        transmitBtn.classList.add('transmitting');
        if (btnText) btnText.textContent = 'STOP'; // Changed to 'STOP'
        if (btnIcon) btnIcon.className = 'ri-stop-circle-line';
    } else {
        textInput.disabled = false;
        textInput.focus();
        transmitBtn.classList.remove('transmitting');
        if (btnText) btnText.textContent = 'TRANSMIT'; // Changed to 'TRANSMIT'
        if (btnIcon) btnIcon.className = 'ri-broadcast-line';
    }
}

// (중복 제거) triggerLed 함수는 아래 ledTimeout 버전만 사용
let ledTimeout = null;
function triggerLed(isShort = false) {
    if (!led) return;
    // 연속 입력에도 항상 on/off가 명확히 동작하도록
    led.classList.remove('off');
    led.classList.add('on');
    if (ledTimeout) clearTimeout(ledTimeout);
    ledTimeout = setTimeout(() => {
        led.classList.remove('on');
        led.classList.add('off');
    }, isShort ? 80 : 200);
}

function stopSequence() {
    stopSignal = true;
    isPlaying = false;
    updateUIState(false);
}