import {CartPole, EVAL_SECONDS, EVAL_TRIALS, HOLD_SECONDS, PASS_COUNT, REWARD_PROTOCOL, PHYSICS_VERSION} from './cartpole-evolution-core.mjs?v=validated1';
import {CartPPO} from './cartpole-evolution-ppo.mjs?v=validated1';
import {Random} from './evolution-ppo.mjs?v=biped7';

export const ROLLOUT = 1536;
export function options(input = {}) {
  const envs = Number(input.envs), seconds = Number(input.seconds);
  const bound = (value, fallback) => Math.max(0, Math.min(100, Number.isFinite(Number(value)) ? Number(value) : fallback));
  const min = bound(input.impactMin, bound(input.impactLoad, 2));
  const max = bound(input.impactMax, bound(input.impactLoad, 5));
  return {envs: Number.isInteger(envs) && envs >= 1 && envs <= 5 ? envs : 1,
    seconds: Number.isInteger(seconds) && seconds >= HOLD_SECONDS + 5 && seconds <= 60 ? seconds : 30,
    impactEnabled: input.impactEnabled === true,
    impactInterval: Math.max(.2, Math.min(60, Number(input.impactInterval) || 3)),
    impactMin: Math.min(min, max), impactMax: Math.max(min, max),
    jointFriction: Math.min(.2,bound(input.jointFriction,.002)),
    jointDamping: Math.min(.1,bound(input.jointDamping,.005))};
}

export function episodeBudget(value) {
  const count = Number(value);
  return Number.isFinite(count) && count >= 1 ? Math.min(100000, Math.floor(count)) : 1000;
}

export function summarize(results) {
  if (!results.length) return null;
  const firsts = results.map(r => r.first).filter(v => v !== null);
  const mean = values => values.reduce((sum, v) => sum + v, 0) / values.length;
  return {attempts: results.length, passed: results.filter(r => r.success).length,
    mean: mean(results.map(r => r.reward)), hold: Math.max(...results.map(r => r.hold)),
    travel: Math.max(...results.map(r => r.travel)), first: firsts.length ? mean(firsts) : null};
}

export class Trainer {
  constructor(level, config, checkpoint, seed = (Math.random() * 2 ** 32) >>> 0) {
    if (checkpoint && checkpoint.physicsVersion !== PHYSICS_VERSION) checkpoint = null;
    this.level = level;
    this.random = new Random(seed ^ 0x13a15);
    this.policy = new CartPPO(level, seed);
    this.steps = this.episodes = this.bestHold = this.travel = 0;
    this.first = null;
    this.history = [];
    this.evaluation = this.bestEvaluation = this.milestone = null;
    this.evaluationHistory=[];
    if (checkpoint) {
      if (checkpoint.version !== 2 || checkpoint.level !== level) throw new Error('다른 레벨의 저장 데이터입니다.');
      this.policy.load(checkpoint.policy);
      for (const key of ['steps', 'episodes', 'bestHold', 'travel']) {
        if (!Number.isFinite(checkpoint[key]) || checkpoint[key] < 0) throw new Error('학습 기록 형식 오류');
        this[key] = checkpoint[key];
      }
      if (!Array.isArray(checkpoint.history) || checkpoint.history.some(r => !Number.isFinite(r?.reward))) {
        throw new Error('Episode 기록 형식 오류');
      }
      for (const key of ['first', 'history', 'evaluation', 'bestEvaluation', 'milestone']) this[key] = checkpoint[key] ?? null;
      this.evaluationHistory=(checkpoint.evaluationHistory??[]).filter(r=>Number.isFinite(r.episode)&&Number.isFinite(r.mean)&&r.protocol===REWARD_PROTOCOL).map(r=>({...r}));
      if (checkpoint.rewardProtocol !== REWARD_PROTOCOL) {
        this.evaluation = this.bestEvaluation = this.milestone = null;
        this.evaluationHistory=[];
      }
      this.random.state = checkpoint.seed >>> 0;
    }
    this.configure(config);
  }

  configure(config) {
    this.config = options(config);
    const previous = this.envs ?? [];
    this.envs = Array.from({length: this.config.envs}, (_, i) => {
      if (previous[i]) { previous[i].setJointResistance(this.config);return previous[i]; }
      const random = new Random((this.random.uniform() * 2 ** 32) >>> 0);
      return new CartPole(this.level, () => random.uniform(), this.config);
    });
    this.streams = this.envs.map(() => []);
    this.count = 0;
  }

  collect(stopAt = Infinity) {
    for (const [i, env] of this.envs.entries()) {
      if (this.episodes >= stopAt) break;
      const obs = env.observe();
      const {action, z, logp, value} = this.policy.action(obs);
      env.disturb(this.config);
      const next = env.step(action, this.config.seconds);
      this.streams[i].push({obs, z, logp, value, reward: next.reward,
        terminated: next.terminated, truncated: next.truncated,
        nextValue: next.terminated ? 0 : this.policy.critic.forward(next.obs).value});
      this.steps++;
      this.count++;
      if (!next.terminated && !next.truncated) continue;
      if (next.invalid) {
        const random = new Random((this.random.uniform() * 2 ** 32) >>> 0);
        this.envs[i] = new CartPole(this.level, () => random.uniform(), this.config);
      } else {
        const result = {...env.result(), episode: ++this.episodes};
        this.bestHold = Math.max(this.bestHold, result.hold);
        this.travel = Math.max(this.travel, result.travel);
        if (this.first === null && result.first !== null) this.first = result.first;
        this.history.push(result);
        env.reset();
      }
    }
  }

  *update() {
    if (!this.count) return;
    // GAE may bootstrap at a rollout boundary, but never crosses environments.
    const rows = this.streams.flatMap(stream => stream.map((r, i) => i === stream.length - 1
      ? {...r, truncated: !r.terminated} : r));
    yield* this.policy.update(rows);
    this.streams = this.envs.map(() => []);
    this.count = 0;
  }

  checkpoint() {
    const {level, steps, episodes, bestHold, travel, first, history, evaluation, bestEvaluation, milestone} = this;
    return {version: 2, physicsVersion: PHYSICS_VERSION, rewardProtocol: REWARD_PROTOCOL, level, steps, episodes, bestHold, travel, first, history: history.slice(),
      evaluation, bestEvaluation, milestone, evaluationHistory:this.evaluationHistory.map(r=>({...r})), seed: this.random.state, policy: this.policy.checkpoint()};
  }
}

export function* evaluate(level, predict, capture, config={}) {
  const results = [];
  for (let i = 0; i < EVAL_TRIALS; i++) {
    const rng = new Random(28289 + level * 773 + i * 35491);
    const env = new CartPole(level, () => rng.uniform(),options(config));
    let impactIndex = 0;
    if (i === 0 && capture) capture(env.frame());
    for (let n = 0; ; n++) {
      if (impactIndex < 3 && n >= [500, 900, 1300][impactIndex]) {
        const direction = (i + impactIndex) % 2 ? -1 : 1;
        env.applyImpact({direction, load: [2, 5, 3][impactIndex]});
        impactIndex++;
      }
      const step = env.step(predict(env.observe()), EVAL_SECONDS);
      if (i === 0 && capture && !step.invalid) capture(env.frame());
      if (step.terminated || step.truncated) break;
      if (n % 32 === 31) yield;
    }
    results.push(env.result());
    yield;
  }
  const result = summarize(results);
  const impacts = results.flatMap(r => r.impacts).filter(hit => hit.eligible);
  const resisted = impacts.filter(hit => hit.resisted).length;
  const recovery = impacts.filter(hit => hit.recoveryTime !== null);
  return {...result, protocol: REWARD_PROTOCOL,
    impactTrials: impacts.length, resisted, recovered: recovery.length,
    maxImpactAngle: impacts.length ? Math.max(...impacts.map(hit => hit.maxAngle)) : null,
    recoveryTime: recovery.length ? recovery.reduce((s,hit)=>s+hit.recoveryTime,0)/recovery.length : null,
    success: result.passed >= PASS_COUNT && impacts.length >= 8 && resisted / impacts.length >= .75};
}
