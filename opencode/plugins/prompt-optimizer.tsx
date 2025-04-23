/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginModule, TuiPromptInfo, TuiPromptRef } from '@opencode-ai/plugin/tui';
import type { RGBA } from '@opentui/core';
import type { Event } from '@opencode-ai/sdk/v2';
import { createSignal, Show, type JSX } from 'solid-js';

type PromptSlotProps = {
    ref?: (ref: TuiPromptRef | undefined) => void;
};

type SessionPromptSlotProps = PromptSlotProps & {
    session_id: string;
    visible?: boolean;
    disabled?: boolean;
    on_submit?: () => void;
};

const OPTIMIZER_AGENT = 'optimize-prompt';
const OPTIMIZER_TITLE = 'Prompt optimize';
const SUCCESS_TOAST_MS = 4000;
const ERROR_TOAST_MS = 12000;
const SESSION_CONTEXT_MESSAGE_LIMIT = 30;
const SESSION_CONTEXT_CHAR_LIMIT = 30000;

type TuiApi = Parameters<TuiPlugin>[0];

type OptimizerStatus = {
    busy: boolean;
    message: string;
    detail?: string;
};

type StatusUpdate = Omit<OptimizerStatus, 'busy'>;

type TextContextPart = {
    type: 'text';
    text: string;
    synthetic?: boolean;
    ignored?: boolean;
};

type TimeoutHandle = ReturnType<typeof setTimeout>;
type IntervalHandle = ReturnType<typeof setInterval>;

type OptimizerEventType = 'session.status' | 'session.error' | 'session.next.step.started' | 'session.next.step.ended' | 'session.next.step.failed' | 'session.next.reasoning.started' | 'session.next.text.started' | 'session.next.tool.called' | 'session.next.tool.success' | 'session.next.tool.failed';

type OptimizerEvent = Extract<Event, { type: OptimizerEventType }>;

const initialStatus: OptimizerStatus = {
    busy: false,
    message: ''
};

const unrefTimer = (timer: unknown) => {
    if (!timer || typeof timer !== 'object' || !('unref' in timer)) return;
    const unref = timer.unref;
    if (typeof unref === 'function') unref.call(timer);
};

const stripFences = (text: string) =>
    text
        .trim()
        .replace(/^```[\w-]*\n?/, '')
        .replace(/\n?```$/, '')
        .trim();

const parseModel = (model: string | undefined) => {
    if (!model) return undefined;
    const [providerID, ...rest] = model.split('/');
    const modelID = rest.join('/');
    if (!providerID || !modelID) return undefined;
    return { providerID, modelID };
};

const limitText = (text: string, limit: number) => {
    if (text.length <= limit) return text;
    return `[truncated]\n${text.slice(-limit).trimStart()}`;
};

const isTextPart = (part: unknown): part is TextContextPart => {
    if (!part || typeof part !== 'object') return false;
    const item = part as { type?: unknown; text?: unknown };
    return item.type === 'text' && typeof item.text === 'string';
};

const buildSessionContext = (api: TuiApi, sessionID: string) => {
    const messages = api.state.session.messages(sessionID).slice(-SESSION_CONTEXT_MESSAGE_LIMIT);
    const context: string[] = [];

    for (const message of messages) {
        if (message.role !== 'user' && message.role !== 'assistant') continue;
        const parts = api.state.part(message.id) as unknown[];
        const text = parts
            .filter((part): part is TextContextPart => isTextPart(part) && !part.synthetic && !part.ignored)
            .map((part) => part.text.trim())
            .filter(Boolean)
            .join('\n')
            .trim();

        if (!text) continue;
        context.push(`${message.role}: ${text}`);
    }

    return limitText(context.join('\n\n').trim(), SESSION_CONTEXT_CHAR_LIMIT);
};

const buildOptimizerPrompt = (draft: string, sessionContext?: string) => {
    const prompt = ['Rewrite this draft into a stronger ready-to-send opencode prompt as plain text.', 'Use this framework internally only: Goal -> Context -> Work Style -> Tool Rules -> Output Contract -> Verification -> Done.', 'Infer the task type: coding, research, writing, analysis, planning, or review.', 'Use the conversation context, when provided, to understand current session intent, references, constraints, and decisions.', 'Preserve the original intent, paths, commands, APIs, constraints, language, tone, and acceptance criteria.', 'Do not invent facts, files, requirements, causes, or context beyond the draft and conversation context.', 'Add missing execution structure only when it materially improves correctness.', 'For coding/debug/review/research tasks, include the necessary inspection/tool/verification expectations naturally in the prompt.', 'Keep the prompt proportional: do not turn a simple request into a giant spec.', 'Do not expose framework block labels unless the user explicitly asked for a template, rationale, or hook spec.', 'Do not use XML tags, markdown fences, or labels such as <task>, <context>, <constraints>, <verification>, or <deliverable>.', 'Prefer 1 concise paragraph. Use bullets only if the draft has multiple explicit constraints or outputs.', 'Return only the final optimized prompt text. No commentary.', ''];

    if (sessionContext) {
        prompt.push('Conversation context for disambiguation only:', sessionContext, '');
    }

    prompt.push('Draft to optimize:', '', draft);

    return prompt.join('\n');
};

const extractAssistantText = (message: unknown) => {
    if (!message || typeof message !== 'object') return '';
    const parts = (message as { parts?: unknown }).parts;
    if (!Array.isArray(parts)) return '';
    return parts
        .filter(isTextPart)
        .map((part) => part.text)
        .join('\n')
        .trim();
};

const responseData = <T,>(result: { data?: T; error?: unknown }, action: string) => {
    if (result.error) throw new Error(`${action} failed: ${JSON.stringify(result.error)}`);
    if (result.data === undefined) throw new Error(`${action} returned empty data`);
    return result.data;
};

const sessionIDFromEvent = (event: OptimizerEvent) => event.properties.sessionID;

const subscribeOptimizerSession = (api: TuiApi, sessionID: string, onStatus: (status: StatusUpdate) => void) => {
    const track = <Type extends OptimizerEventType>(type: Type, handler: (event: Extract<OptimizerEvent, { type: Type }>) => void) =>
        api.event.on(type, (event) => {
            if (sessionIDFromEvent(event) !== sessionID) return;
            handler(event);
        });

    const off = [
        track('session.status', (event) => {
            if (event.properties.status.type === 'busy') {
                onStatus({ message: 'optimizer running', detail: 'waiting for model response' });
                return;
            }
            if (event.properties.status.type === 'retry') {
                onStatus({
                    message: `retrying optimizer #${event.properties.status.attempt}`,
                    detail: event.properties.status.message
                });
                return;
            }
            onStatus({ message: 'optimizer idle', detail: 'finalizing result' });
        }),
        track('session.error', (event) => {
            const error = event.properties.error;
            const detail = error?.data && 'message' in error.data && typeof error.data.message === 'string' ? error.data.message : 'session error';
            onStatus({ message: 'optimizer error', detail });
        }),
        track('session.next.step.started', (event) => {
            const model = event.properties.model;
            onStatus({
                message: 'optimizer step started',
                detail: `${event.properties.agent} · ${model.providerID}/${model.id}`
            });
        }),
        track('session.next.step.ended', (event) => {
            onStatus({ message: 'optimizer step done', detail: event.properties.finish });
        }),
        track('session.next.step.failed', () => {
            onStatus({ message: 'optimizer step failed', detail: 'checking error' });
        }),
        track('session.next.reasoning.started', () => {
            onStatus({ message: 'optimizer thinking', detail: 'checking project context' });
        }),
        track('session.next.text.started', () => {
            onStatus({ message: 'optimizer writing', detail: 'drafting optimized prompt' });
        }),
        track('session.next.tool.called', (event) => {
            onStatus({ message: 'optimizer inspecting', detail: `tool: ${event.properties.tool}` });
        }),
        track('session.next.tool.success', () => {
            onStatus({ message: 'optimizer inspected', detail: 'continuing' });
        }),
        track('session.next.tool.failed', () => {
            onStatus({ message: 'optimizer tool failed', detail: 'continuing if recoverable' });
        })
    ];

    return () => {
        for (const item of off) item();
    };
};

const optimizeWithAgent = async (api: TuiApi, draft: string, sessionContext: string | undefined, onStatus: (status: StatusUpdate) => void) => {
    const model = parseModel(api.state.config.small_model ?? api.state.config.model);
    let sessionID: string | undefined;
    let unsubscribe = () => {};

    try {
        onStatus({ message: 'creating optimizer session', detail: OPTIMIZER_AGENT });
        const session = responseData(
            await api.client.session.create({
                title: OPTIMIZER_TITLE,
                agent: OPTIMIZER_AGENT,
                model: model ? { id: model.modelID, providerID: model.providerID } : undefined
            }),
            'create optimizer session'
        );
        sessionID = session.id;
        unsubscribe = subscribeOptimizerSession(api, sessionID, onStatus);
        onStatus({
            message: 'sending draft to optimizer',
            detail: model ? `${model.providerID}/${model.modelID}` : 'default model'
        });

        const assistant = responseData(
            await api.client.session.prompt({
                sessionID,
                agent: OPTIMIZER_AGENT,
                model,
                parts: [
                    {
                        type: 'text',
                        text: buildOptimizerPrompt(draft, sessionContext)
                    }
                ]
            }),
            'run optimizer agent'
        );

        onStatus({ message: 'parsing optimizer output', detail: 'cleaning response' });
        const optimized = stripFences(extractAssistantText(assistant));
        if (!optimized) throw new Error('optimizer agent returned empty text');
        return optimized;
    } finally {
        unsubscribe();
        if (sessionID) {
            onStatus({ message: 'cleaning optimizer session', detail: sessionID });
            await api.client.session.delete({ sessionID }).catch(() => undefined);
        }
    }
};

const textOnly = (prompt: TuiPromptInfo) => prompt.parts.length === 0;

const makePromptInfo = (text: string): TuiPromptInfo => ({
    input: text,
    parts: []
});

type Color = RGBA | string;

const themeColor = (theme: Record<string, unknown>, name: string, fallback: string): Color => {
    const value = theme[name];
    return value && (typeof value === 'string' || typeof value === 'object') ? (value as Color) : fallback;
};

const OptimizeButton = (props: { status: () => OptimizerStatus; optimize: () => Promise<void>; theme: Record<string, unknown>; frame: () => string; children?: JSX.Element }) => {
    const [hover, setHover] = createSignal(false);
    const busy = () => props.status().busy;
    const fg = () => (hover() ? themeColor(props.theme, 'primary', '#BD93F9') : themeColor(props.theme, 'textMuted', '#6272A4'));
    const bg = () => (hover() ? themeColor(props.theme, 'backgroundElement', '#44475A') : undefined);

    return (
        <box flexDirection='row' gap={1}>
            {props.children}
            <Show when={props.status().message}>
                <box flexDirection='row' gap={1} flexShrink={0}>
                    <text fg={busy() ? themeColor(props.theme, 'primary', '#BD93F9') : themeColor(props.theme, 'textMuted', '#6272A4')}>
                        {busy() ? props.frame() : '✓'} {props.status().message}
                    </text>
                    <Show when={props.status().detail}>{(detail) => <text fg={themeColor(props.theme, 'textMuted', '#6272A4')}>· {detail()}</text>}</Show>
                </box>
            </Show>
            <box
                paddingLeft={1}
                paddingRight={1}
                backgroundColor={bg()}
                onMouseOver={() => setHover(true)}
                onMouseOut={() => setHover(false)}
                onMouseUp={() => {
                    void props.optimize();
                }}
            >
                <text fg={fg()}>{busy() ? ' optimizing…' : ' optimize'}</text>
            </box>
        </box>
    );
};

const usePromptRef = (upstream?: (ref: TuiPromptRef | undefined) => void) => {
    let current: TuiPromptRef | undefined;
    return {
        get: () => current,
        bind: (ref: TuiPromptRef | undefined) => {
            current = ref;
            upstream?.(ref);
        }
    };
};

const tui: TuiPlugin = async (api) => {
    const [status, setStatus] = createSignal<OptimizerStatus>(initialStatus);
    const [frame, setFrame] = createSignal('⠋');
    let clearStatusTimer: TimeoutHandle | undefined;
    let frameTimer: IntervalHandle | undefined;

    const stopFrameTimer = () => {
        if (!frameTimer) return;
        clearInterval(frameTimer);
        frameTimer = undefined;
    };

    const startFrameTimer = () => {
        if (frameTimer) return;
        const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
        let index = 0;
        frameTimer = setInterval(() => {
            index = (index + 1) % frames.length;
            setFrame(frames[index]);
        }, 120);
        unrefTimer(frameTimer);
    };

    const updateStatus = (next: StatusUpdate) => {
        if (clearStatusTimer) {
            clearTimeout(clearStatusTimer);
            clearStatusTimer = undefined;
        }
        setStatus((current) => ({ ...current, ...next }));
    };

    const finishStatus = (next: StatusUpdate) => {
        stopFrameTimer();
        setStatus({ busy: false, ...next });
        clearStatusTimer = setTimeout(() => {
            setStatus(initialStatus);
            clearStatusTimer = undefined;
        }, SUCCESS_TOAST_MS);
        unrefTimer(clearStatusTimer);
    };

    api.lifecycle.onDispose(() => {
        if (clearStatusTimer) clearTimeout(clearStatusTimer);
        stopFrameTimer();
    });

    const runOptimize = async (ref: TuiPromptRef | undefined, sourceSessionID?: string) => {
        if (!ref) return;
        if (status().busy) return;

        const current = ref.current;
        const draft = current.input.trim();
        if (!draft) {
            api.ui.toast({ variant: 'info', message: 'prompt empty' });
            return;
        }

        if (!textOnly(current)) {
            api.ui.toast({
                variant: 'warning',
                message: 'prompt optimize supports text-only prompts for now'
            });
            return;
        }

        const sessionContext = sourceSessionID ? buildSessionContext(api, sourceSessionID) : undefined;

        setStatus({
            busy: true,
            message: 'starting optimizer',
            detail: sessionContext ? 'preparing draft with session context' : 'preparing draft'
        });
        startFrameTimer();
        try {
            const optimized = await optimizeWithAgent(api, draft, sessionContext, updateStatus);
            ref.set(makePromptInfo(optimized));
            ref.focus();
            finishStatus({ message: 'prompt optimized', detail: 'ready to edit or submit' });
            api.ui.toast({
                variant: 'success',
                message: 'prompt optimized',
                duration: SUCCESS_TOAST_MS
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            finishStatus({ message: 'optimize failed', detail: message });
            api.ui.toast({
                variant: 'error',
                message: `optimize err: ${message}`,
                duration: ERROR_TOAST_MS
            });
        }
    };

    api.slots.register({
        order: 900,
        slots: {
            home_prompt(_ctx, props: PromptSlotProps) {
                const ref = usePromptRef(props.ref);
                return (
                    <api.ui.Prompt
                        ref={ref.bind}
                        right={
                            <OptimizeButton status={status} frame={frame} optimize={() => runOptimize(ref.get())} theme={api.theme.current}>
                                <api.ui.Slot name='home_prompt_right' />
                            </OptimizeButton>
                        }
                    />
                );
            },
            session_prompt(_ctx, props: SessionPromptSlotProps) {
                const ref = usePromptRef(props.ref);
                return (
                    <api.ui.Prompt
                        sessionID={props.session_id}
                        visible={props.visible}
                        disabled={props.disabled}
                        onSubmit={props.on_submit}
                        ref={ref.bind}
                        right={
                            <OptimizeButton status={status} frame={frame} optimize={() => runOptimize(ref.get(), props.session_id)} theme={api.theme.current}>
                                <api.ui.Slot name='session_prompt_right' session_id={props.session_id} />
                            </OptimizeButton>
                        }
                    />
                );
            }
        }
    });
};

const plugin: TuiPluginModule & { id: string } = {
    id: 'prompt-optimizer',
    tui
};

export default plugin;
