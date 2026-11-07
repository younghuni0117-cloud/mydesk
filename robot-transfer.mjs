// Learning messages carry only values consumed by the learner. Scenes keep geometry.
export function packRollout(trial,prepared){if(prepared.options?.record)return trial;const {metrics,pushPlan,commandSchedule,experience}=trial;return {metrics,pushPlan,commandSchedule,...(experience?{experience}: {})};}
export function observationScene(trial){if(!trial)return null;const {experience,...scene}=trial;return scene;}
