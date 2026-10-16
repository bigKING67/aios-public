import * as v2 from "./v2-questions";
import {
  WORKFLOW_QUESTION,
  VIDEO_PRACTICE_QUESTION,
} from "./current-questions";
import {
  PROJECT_QUESTION as OLD_PROJECT,
  VIDEO_TASK_QUESTION,
  REMIX_QUESTION,
  VIDEO_TASK_MOCK_SOURCE,
} from "./legacy-questions";

export function questionHistory(version: number): string[] {
  if (version === 3)
    return [
      VIDEO_PRACTICE_QUESTION,
      WORKFLOW_QUESTION,
    ].map((q) => [q.title, q.intro, ...q.prompts, q.note].join("\n\n"));
  if (version === 2)
    return [v2.WORKFLOW_QUESTION, v2.PROJECT_QUESTION, v2.AGENT_QUESTION].map(
      (q) => [q.title, q.intro, ...q.prompts, q.note].join("\n\n"),
    );
  if (version === 1)
    return [
      [
        OLD_PROJECT.title,
        OLD_PROJECT.intro,
        ...OLD_PROJECT.prompts,
        OLD_PROJECT.note,
      ].join("\n\n"),
      [
        VIDEO_TASK_QUESTION.title,
        VIDEO_TASK_QUESTION.scenario,
        VIDEO_TASK_QUESTION.apiIntro,
        ...VIDEO_TASK_QUESTION.apis.map(
          (api) => `${api.signature}: ${api.description}`,
        ),
        VIDEO_TASK_QUESTION.taskIntro,
        ...VIDEO_TASK_QUESTION.requirements,
        VIDEO_TASK_QUESTION.note,
        VIDEO_TASK_QUESTION.mockIntro,
        VIDEO_TASK_MOCK_SOURCE,
      ].join("\n\n"),
      [
        REMIX_QUESTION.title,
        REMIX_QUESTION.scenario,
        ...REMIX_QUESTION.prompts,
        REMIX_QUESTION.note,
      ].join("\n\n"),
    ];
  throw new Error("不支持的题目版本");
}
