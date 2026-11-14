// Generate an untrained v10 snapshot; no network or application data is accessed.
import fs from 'node:fs';
import {RobotLearner} from '../robot-learning.mjs';
import {normalizeActuation} from '../robot-actuation.mjs';
import {normalizeEvaluationSettings} from '../robot-evaluation.mjs';
import {normalizeGround} from '../robot-training-ground.mjs';
import {taskEnvironments,TASK_DEFAULTS} from '../robot-task-settings.mjs';
import {VISION_VERSION} from '../robot-sensors.mjs';
import {combatSettings} from '../robot-combat.mjs';
const environment={terrain:'meadow',courseVersion:14,solverVersion:2,trainingGround:normalizeGround(),visionVersion:VISION_VERSION,bodyVersion:7,...combatSettings(),...normalizeActuation(),...normalizeEvaluationSettings(),taskEnvironments:taskEnvironments(TASK_DEFAULTS)};
const model=new RobotLearner(null,70,environment,{deferEvaluation:process.argv.includes('--defer')});model.taskSettings=structuredClone(TASK_DEFAULTS);fs.writeFileSync(process.argv[2]||'/tmp/robot70-baseline.json',JSON.stringify(model.snapshot()));console.log('Untrained model generated:',model.snapshot().version,model.weights.length,'weights;',model.attempts,'attempts');
