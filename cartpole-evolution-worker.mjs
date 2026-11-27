import {DT} from './cartpole-evolution-core.mjs?v=2';
import {CartPPO} from './cartpole-evolution-ppo.mjs?v=2';
import {Trainer, ROLLOUT, evaluate, options, summarize} from './cartpole-evolution-training.mjs?v=2';

let trainer, settled, pending, update, assessment, replay, recording, speed = 1, running = false;
let timer, lastTick, lastFrame, lastStats, lastSaved, debt = 0, sampleSteps = 0;
const send = (type, data = {}) => postMessage({type, ...data});

function frame() {
  send('frame', {frames: trainer.envs.map(env => env.frame())});
}

function stats(now = performance.now()) {
  send('stats', {steps: trainer.steps, episodes: trainer.episodes,
    updates: trainer.policy.updates, diagnostics: trainer.policy.last,
    recent: summarize(trainer.history.slice(-30)), history: trainer.history.slice(-240),
    first: trainer.first, bestHold: trainer.bestHold, travel: trainer.travel,
    evaluation: trainer.evaluation, bestEvaluation: trainer.bestEvaluation, pending: Boolean(pending),
    rate: running ? Math.round((trainer.steps - sampleSteps) * 1000 / Math.max(1, now - lastStats)) : 0});
  lastStats = now;
  sampleSteps = trainer.steps;
}

function save(force = false) {
  if (force || performance.now() - lastSaved >= 1200) {
    send('checkpoint', {checkpoint: settled});
    lastSaved = performance.now();
  }
}

function beginEvaluation(manual) {
  const policy = new CartPPO(trainer.level, 0);
  policy.load(settled.policy);
  const samples = [];
  assessment = {iterator: evaluate(trainer.level, obs => policy.predict(obs),
    manual ? sample => samples.push(sample) : undefined), manual, updates: policy.updates, samples};
  if (manual) send('state', {state: 'evaluating'});
}

function advanceEvaluation() {
  const next = assessment.iterator.next();
  if (!next.done) return;
  const result = {...next.value, updates: assessment.updates};
  const firstPass = result.success && !trainer.milestone;
  trainer.evaluation = result;
  const best = trainer.bestEvaluation;
  if (!best || result.passed > best.passed || (result.passed === best.passed &&
      (result.hold > best.hold || (result.hold === best.hold && result.mean > best.mean)))) {
    trainer.bestEvaluation = result;
  }
  if (firstPass) trainer.milestone = {episode: settled.episodes, updates: result.updates, passed: result.passed};
  settled = {...settled, evaluation: result, bestEvaluation: trainer.bestEvaluation, milestone: trainer.milestone};
  if (assessment.manual) {
    recording = assessment.samples;
    send('recording');
    send('state', {state: 'paused'});
  }
  assessment = null;
  save(true);
  if (firstPass) send('milestone', {level: trainer.level, milestone: trainer.milestone});
  stats();
}

function applyConfig() {
  if (pending && !trainer.count && !update) {
    trainer.configure(pending);
    pending = null;
    frame();
    stats();
  }
}

function schedule() {
  if (!timer && (running || assessment?.manual || replay)) timer = setTimeout(tick, 8);
}

function tick() {
  timer = null;
  try {
    const now = performance.now();
    if (replay) {
      const index = Math.min(recording.length - 1, Math.floor((now - replay.start) / (DT * 1000)));
      if (replay.index !== index) {
        replay.index = index;
        send('frame', {frames: [recording[index]], replay: true});
      }
      if (index === recording.length - 1) {
        replay = null;
        send('state', {state: 'replayDone'});
      }
      schedule();
      return;
    }
    const elapsed = Math.min(60, now - lastTick);
    lastTick = now;
    debt = Math.min(.12, debt + elapsed * speed / 1000);
    const deadline = now + 7;
    do {
      if (assessment) {
        advanceEvaluation();
      } else if (running && update) {
        if (update.next().done) {
          update = null;
          settled = trainer.checkpoint();
          save();
          applyConfig();
          if (trainer.policy.updates % 5 === 0) beginEvaluation(false);
          stats();
        }
      } else if (running && trainer.count >= ROLLOUT) {
        update = trainer.update();
      } else if (running && (speed === 0 || debt >= DT)) {
        trainer.collect();
        if (speed !== 0) debt -= DT;
      } else break;
    } while ((running || assessment?.manual) && performance.now() < deadline);
    if (now - lastFrame >= 25 && running) { frame(); lastFrame = now; }
    if (now - lastStats >= 500 && running) stats();
    schedule();
  } catch (error) {
    running = false;
    assessment = null;
    send('error', {message: error.message});
    if (settled) save(true);
  }
}

onmessage = ({data}) => {
  try {
    if (data.type === 'init') {
      let warning;
      try {
        trainer = new Trainer(data.level, data.config, data.checkpoint);
      } catch (error) {
        if (!data.checkpoint) throw error;
        trainer = new Trainer(data.level, data.config);
        warning = '저장된 정책을 읽을 수 없어 새 정책으로 시작합니다.';
      }
      settled = trainer.checkpoint();
      lastTick = lastFrame = lastStats = lastSaved = performance.now();
      sampleSteps = trainer.steps;
      send('ready', {warning});
      frame();
      stats();
      return;
    }
    if (!trainer) return;
    if (data.type === 'start') {
      if (assessment?.manual) assessment = null;
      replay = null;
      running = true;
      lastTick = performance.now();
      send('state', {state: 'running'});
    } else if (data.type === 'pause') {
      running = false;
      replay = null;
      debt = 0;
      if (assessment?.manual) assessment = null;
      save(true);
      frame();
      stats();
      send('state', {state: 'paused'});
    } else if (data.type === 'config') {
      const config = options(data.config);
      pending = config.envs === trainer.config.envs && config.seconds === trainer.config.seconds ? null : config;
      applyConfig();
      stats();
    } else if (data.type === 'speed') {
      speed = [0, 1, 4].includes(data.speed) ? data.speed : 1;
      debt = 0;
    } else if (data.type === 'evaluate') {
      running = false;
      replay = null;
      beginEvaluation(true);
    } else if (data.type === 'replay' && recording?.length) {
      running = false;
      replay = {start: performance.now(), index: -1};
      send('state', {state: 'replaying'});
    }
    schedule();
  } catch (error) {
    send('error', {message: error.message});
  }
};
