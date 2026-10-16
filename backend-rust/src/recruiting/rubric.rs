use super::types::{RubricDimension, RubricResponse, RubricThresholds};
const PROJECT_MAX: i16 = 20;
const ASYNC_MAX: i16 = 30;
const ROBUSTNESS_MAX: i16 = 30;
const DESIGN_MAX: i16 = 20;
const ADVANCE_MIN: i16 = 80;
const HOLD_MIN: i16 = 65;
/// 第二题两项合计低于此值时一票否决。
const VIDEO_TASK_MIN: i16 = 30;

pub(super) fn legacy_rubric() -> RubricResponse {
    RubricResponse {
        dimensions: vec![
            RubricDimension {
                key: "project".into(),
                label: "真实项目经历".into(),
                max: PROJECT_MAX,
                guidance: "项目是否真实，能否讲清自己负责的部分、用到的技术和亲手解决的问题。团队项目分不清个人贡献要明显扣分。".into(),
            },
            RubricDimension {
                key: "asyncLogic".into(),
                label: "API 与异步逻辑".into(),
                max: ASYNC_MAX,
                guidance: "能否正确创建任务、约 1 秒间隔轮询、成功返回 videoUrl、失败抛出带上下文的错误。".into(),
            },
            RubricDimension {
                key: "robustness".into(),
                label: "异常处理与代码质量".into(),
                max: ROBUSTNESS_MAX,
                guidance: "超时、失败、接口异常是否都能结束等待；代码是否可读、可测试（时间与请求函数可注入）。对照下方隐藏检查点。".into(),
            },
            RubricDimension {
                key: "design".into(),
                label: "AI 应用设计思路".into(),
                max: DESIGN_MAX,
                guidance: "能否区分模型负责的理解、规划、选择，与程序和 FFmpeg / MediaKit 负责的确定性处理，并给出业务验收方法。".into(),
            },
        ],
        thresholds: RubricThresholds {
            advance_min: ADVANCE_MIN,
            hold_min: HOLD_MIN,
            video_task_min: VIDEO_TASK_MIN,
        },
        video_task_checkpoints: [
            "单次请求卡住：getVideoTask 一直不返回时仍能在 30 秒内结束（每次请求单独超时，如 Promise.race / AbortSignal）。只在循环里判断 Date.now() 的写法过不了这一条。",
            "创建任务也计入总时长：createVideoTask 失败或卡住同样受 30 秒限制，并给出可读错误。",
            "区分偶发错误与终态失败：单次网络异常可以有限次重试，status 为 failed 时立即停止并抛出接口返回的 error。",
            "防御异常返回：未知 status、succeeded 却没有 videoUrl、返回 null 等情况不会死循环或返回 undefined。",
            "轮询间隔真正等待约 1 秒，没有忙等或并发叠加请求；超时后不再发出新的查询。",
        ]
        .map(String::from)
        .to_vec(),
        strong_signals: "能提供自己做过的实际项目；第二题代码可运行，处理了超时、失败和单次请求卡住；AI 使用说明能指出自己修正了 AI 代码的哪些问题；第三题能讲清模型与视频工具的分工，并考虑素材匹配、差异化和审核验收。".into(),
        average_signals: "会调用 API、会用 AI 生成代码，但对异常处理、业务流程和代码为什么这样写缺少理解；AI 使用说明泛泛而谈。".into(),
        weak_signals: "项目说不清个人贡献；代码有明显逻辑错误（如无限等待、失败不抛错）；第三题只回答“调用大模型自动生成五条视频”，没有具体步骤。".into(),
        interview_follow_up: "技术面先请候选人用 10 分钟讲解第二题代码，再现场加一个小需求：支持取消任务（例如传入 AbortSignal）。".into(),
    }
}

/// Stable wire/storage score slots; their labels and limits are versioned.
/// V2: project=workflow, asyncLogic=project engineering, robustness=product taste,
/// design=agent. Old submissions retain their original interpretation.
pub(super) fn rubric(version: i32) -> crate::error::AppResult<RubricResponse> {
    if version == 1 {
        return Ok(legacy_rubric());
    }
    if version == 3 {
        return Ok(practical_rubric());
    }
    if version != 2 {
        return Err(crate::error::AppError::bad_request("不支持的题目版本"));
    }
    Ok(RubricResponse {
        dimensions: vec![
            RubricDimension { key: "project".into(), label: "第一题：AI 开发工作流".into(), max: 25, guidance: "看需求拆解、与 AI 分工、排障和验证习惯，规则是否来自具体实践。未使用规则文件不扣分；不因篇幅、工具数量或 AI 使用本身加减分。".into() },
            RubricDimension { key: "asyncLogic".into(), label: "第二题：项目工程与技术选型".into(), max: 25, guidance: "看核心流程完整度、个人贡献、技术选择与问题是否匹配，以及实际验证证据。按作品检查，不能只按文字完整度判高分；未核验的部分记入备注。".into() },
            RubricDimension { key: "robustness".into(), label: "第二题：产品体验与审美品味".into(), max: 25, guidance: "看信息清晰度、操作与反馈、细节一致性，以及能否解释取舍。CLI 可看命令、输出和错误信息；不按装饰多少或面试官个人风格偏好打分。".into() },
            RubricDimension { key: "design".into(), label: "第三题：自己的 Agent".into(), max: 25, guidance: "看问题是否真实、是否需要 Agent、模型与工具选型、最小范围、权限边界、失败处理和结果验证。已有实现不是必需，不奖励堆砌框架。".into() },
        ],
        thresholds: RubricThresholds { advance_min: 80, hold_min: 65, video_task_min: 0 },
        video_task_checkpoints: [
            "第一题：规则与实际项目是否一致？任选一条规则，追问它如何产生、何时不适用。",
            "第二题：实际演示核心流程，核对个人贡献、工程选择、交互细节和已知不足。",
            "第三题：沿答案中的一次任务增加一个条件，观察能否调整范围、处理失败并验证结果。",
        ].map(String::from).to_vec(),
        strong_signals: "有可检查成果，能解释选择并提供验证；三题互相印证，能指出局限并修正判断。高分表示值得进一步了解，不代表已证明独立能力。".into(),
        average_signals: "有作品和基本流程，但选择依据、验证证据或产品细节薄弱；应在面试中核验。".into(),
        weak_signals: "答案泛泛而谈，个人贡献不清；作品与说明不一致，缺少失败处理或验证意识。".into(),
        interview_follow_up: "围绕提交时的三份答案面试：工作流追问具体规则的来由；项目现场演示并定位实现；Agent 加一个新条件推演。允许 AI，观察解释、修改和验证，而非背诵。自动分数仅作初筛提示，结合实际成果人工判断。".into(),
    })
}

fn practical_rubric() -> RubricResponse {
    RubricResponse {
        dimensions: vec![
            RubricDimension { key: "project".into(), label: "镜头判断与技术取舍".into(), max: 20, guidance: "结合实际视频解释镜头边界和方法选择，能定位误切或漏切并说明取舍。不按算法复杂度或模型价格评分。".into() },
            RubricDimension { key: "asyncLogic".into(), label: "批量实现与可复现交付".into(), max: 30, guidance: "一次运行处理三条视频；代码可运行，依赖和运行步骤明确，结果可追溯到源视频。核对个人贡献和关键实现。".into() },
            RubricDimension { key: "robustness".into(), label: "输出质量、异常处理与验证".into(), max: 35, guidance: "时间范围和预览图正确15分、输入差异及失败反馈10分、实际验证与局限10分。简洁易读的输出同样体现品味；可视化可作为本项加分依据，总分不超35，不要求导出独立片段。".into() },
            RubricDimension { key: "design".into(), label: "AI 开发方式与规则".into(), max: 15, guidance: "规则有实际来由，能说明AI分工、个人检查及修改。新整理的规则与已有规则同等看实际作用，不以工具数量评分。".into() },
        ],
        thresholds: RubricThresholds { advance_min: 80, hold_min: 65, video_task_min: 0 },
        video_task_checkpoints: [
            "运行三条视频，核对输出时间、预览图与源视频能否对应。",
            "定位一次误切或漏切，解释方法与阈值的取舍；检查无音轨及单条失败时的行为。",
            "对照说明验证复现步骤、实际用时、模拟部分及个人修改，不能只读自述给分。",
        ].map(String::from).to_vec(),
        strong_signals: "交付可运行，输出便于检查，能定位边界问题并用验证证据解释取舍；规则与实际开发一致。".into(),
        average_signals: "基本流程可用，但输入差异、结果检查或复现说明不充分。".into(),
        weak_signals: "无法运行或输出与视频不对应；无法解释实现与局限，个人贡献不清。".into(),
        interview_follow_up: "围绕提交代码、输出和规则核验；改变一项输入条件，观察定位、修改与验证。总分仅作初筛参考，不等于能力已被证明。".into(),
    }
}
