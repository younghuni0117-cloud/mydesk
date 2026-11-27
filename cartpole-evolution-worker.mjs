import {CartPPO} from './cartpole-evolution-ppo.mjs?v=2';
import {Trainer, ROLLOUT, episodeBudget, evaluate, options, summarize} from './cartpole-evolution-training.mjs?v=3';

let trainer, settled, pending, update, assessment, running = false;
let timer, lastStats, lastSaved, sampleSteps = 0, planStart = 0, target = 0;
const send = (type, data = {}) => postMessage({type, ...data});

function publishPolicy() {
  send('policy', {policy: settled.policy});
}

function stats(now = performance.now()) {
  send('stats', {steps: trainer.steps, episodes: trainer.episodes, planStart, target, envs: trainer.config.envs,
    incomplete: target > 0 && (trainer.episodes < target || trainer.count > 0),
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
    send('recording', {frames: assessment.samples});
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
    stats();
  }
}

function schedule() {
  if (!timer && (running || assessment)) timer = setTimeout(tick, 4);
}

function tick() {
  timer = null;
  try {
    const now = performance.now();
    const deadline = now + 7;
    do {
      if (assessment) {
        advanceEvaluation();
      } else if (running && update) {
        if (update.next().done) {
          update = null;
          settled = trainer.checkpoint();
          save();
          publishPolicy();
          applyConfig();
          if (trainer.policy.updates % 5 === 0) beginEvaluation(false);
          stats();
        }
      } else if (running && trainer.count && (trainer.count >= ROLLOUT || trainer.episodes >= target)) {
        update = trainer.update();
      } else if (running && trainer.episodes >= target) {
        running = false;
        save(true);
        stats();
        send('state', {state: 'complete'});
      } else if (running) {
        trainer.collect(target);
      } else break;
    } while ((running || assessment) && performance.now() < deadline);
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
      lastStats = lastSaved = performance.now();
      sampleSteps = trainer.steps;
      send('ready', {warning});
      publishPolicy();
      stats();
      return;
    }
    if (!trainer) return;
    if (data.type === 'start') {
      if (assessment?.manual) assessment = null;
      if (data.count !== undefined || !target || trainer.episodes >= target && !trainer.count && !update) {
        planStart = trainer.episodes;
        target = planStart + episodeBudget(data.count);
      }
      running = true;
      send('state', {state: 'running'});
      stats();
    } else if (data.type === 'pause') {
      running = false;
      assessment = null;
      save(true);
      stats();
      send('state', {state: 'paused'});
    } else if (data.type === 'config') {
      const config = options(data.config);
      pending = config.envs === trainer.config.envs && config.seconds === trainer.config.seconds ? null : config;
      applyConfig();
      stats();
    } else if (data.type === 'evaluate') {
      running = false;
      beginEvaluation(true);
    }
    schedule();
  } catch (error) {
    send('error', {message: error.message});
  }
};
