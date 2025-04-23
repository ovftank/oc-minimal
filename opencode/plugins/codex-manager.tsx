/** @jsxImportSource @opentui/solid */
import type { RGBA } from '@opentui/core';
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from '@opencode-ai/plugin/tui';
import { For, Show, createEffect, createMemo, createResource, createSignal } from 'solid-js';

declare const process: { env: Record<string, string | undefined> };
declare const Bun: {
    file: (path: string) => { text: () => Promise<string> };
    spawn: (command: string[]) => { exited: Promise<number> };
    write: (path: string, content: string, options?: { createPath?: boolean }) => Promise<unknown>;
};

type AccountConfig = {
    access: string;
    refresh?: string;
    expires?: number;
    accountId?: string;
    email?: string;
    label?: string;
};

type MultiAuthState = {
    accounts: Record<string, AccountConfig>;
    active: string;
};

type OpenAiAuth = {
    type?: string;
    access?: string;
    refresh?: string;
    expires?: number | string;
    accountId?: string;
    account_id?: string;
    chatgptAccountId?: string;
    chatgpt_account_id?: string;
};

type OpenAiOAuthAuth = OpenAiAuth & { access: string };

type AuthStore = {
    openai?: OpenAiAuth;
};

type JwtClaims = Record<string, unknown> & {
    'https://api.openai.com/auth.chatgpt_account_id'?: string;
    chatgpt_account_id?: string;
};

type RateLimitWindow = {
    used_percent?: number;
    limit_window_seconds?: number;
    reset_after_seconds?: number;
    reset_at?: number;
};

type UsageResponse = {
    user_id?: string;
    account_id?: string;
    email?: string;
    plan_type?: string;
    rate_limit?: {
        allowed?: boolean;
        limit_reached?: boolean;
        primary_window?: RateLimitWindow;
        secondary_window?: RateLimitWindow;
    };
    code_review_rate_limit?: unknown;
    additional_rate_limits?: unknown;
    credits?: unknown;
    spend_control?: unknown;
    rate_limit_reached_type?: unknown;
    rate_limit_reset_credits?: unknown;
};

type AccountQuota = {
    email?: string;
    primaryRemaining?: number;
    primaryResetIn: string;
    secondaryRemaining?: number;
    secondaryResetIn: string;
    error?: string;
};

type Color = RGBA | string;

type MouseControlEvent = {
    stopPropagation: () => void;
    preventDefault?: () => void;
};

type QuotaDetailsProps = {
    loading: boolean;
    quota?: AccountQuota;
    theme: Record<string, unknown>;
    muted: Color;
    error: Color;
};

type AccountRowProps = {
    id: string;
    account: AccountConfig;
    active: boolean;
    quota?: AccountQuota;
    quotasLoading: boolean;
    theme: Record<string, unknown>;
    muted: Color;
    text: Color;
    success: Color;
    error: Color;
    inputBackground: Color;
    onSwitch: (id: string) => void;
    onDelete: (id: string) => void;
};

const AUTH_FILE_RELATIVE_PATH = ['.local', 'share', 'opencode', 'auth.json'];
const CHATGPT_BACKEND_BASE_URL = 'https://chatgpt.com/backend-api';

const color = (theme: Record<string, unknown>, name: string, fallback: string): Color => {
    const value = theme[name];
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') return value as RGBA;
    return fallback;
};

const themeColor = (theme: Record<string, unknown>, names: string[], fallback: string): Color => {
    for (const name of names) {
        const value = theme[name];
        if (typeof value === 'string') return value;
        if (value && typeof value === 'object') return value as RGBA;
    }
    return fallback;
};

const nonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

const firstNonEmptyString = (...values: unknown[]) => values.find(nonEmptyString);

const errorMessage = (error: unknown) => {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return 'unknown error';
};

const authError = (message: string) => new Error(message);

const oauthErrorMessage = (error: { data?: { message?: string }; name?: string } | undefined) => firstNonEmptyString(error?.data?.message, error?.name) ?? 'Unknown error';

const getUserProfile = () => {
    const userProfile = process.env.USERPROFILE;
    if (!userProfile) throw authError('userprofile unavailable');
    return userProfile;
};

const toNumber = (value: unknown) => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
};

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

const remainingPercent = (used: number | undefined) => (typeof used === 'number' && Number.isFinite(used) ? clampPercent(100 - used) : undefined);

const percent = (value: number | undefined) => (typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value)}%` : '?');

const formatResetIn = (seconds: number | undefined) => {
    if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return '?';
    const totalMinutes = Math.max(0, Math.ceil(seconds / 60));
    const days = Math.floor(totalMinutes / (24 * 60));
    const dayRemainderMinutes = totalMinutes % (24 * 60);
    const dayHours = Math.floor(dayRemainderMinutes / 60);
    if (days > 0) return dayHours === 0 ? `${days}d` : `${days}d ${dayHours}h`;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours <= 0) return `${minutes}m`;
    if (minutes === 0) return `${hours}h`;
    return `${hours}h ${minutes}m`;
};

const remainingColor = (value: number | undefined, theme: Record<string, unknown>) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return themeColor(theme, ['textMuted', 'muted'], '#6272A4');
    if (value <= 10) return color(theme, 'error', '#FF5555');
    if (value <= 30) return color(theme, 'warning', '#FFB86C');
    return color(theme, 'success', '#50FA7B');
};

const userConfigPath = (...segments: string[]) => [getUserProfile(), '.config', 'opencode', ...segments].join('\\');

const getAuthFilePath = () => [getUserProfile(), ...AUTH_FILE_RELATIVE_PATH].join('\\');

const appendDebugLog = async (path: string, entry: string) => {
    try {
        const existing = await Bun.file(path).text();
        await Bun.write(path, `${existing}${entry}`, { createPath: true });
        return;
    } catch {}

    try {
        await Bun.write(path, entry, { createPath: true });
    } catch {}
};

const openExternalUrl = async (url: string) => {
    try {
        return (await Bun.spawn(['rundll32', 'url.dll,FileProtocolHandler', url]).exited) === 0;
    } catch {
        return false;
    }
};

const readAuthStore = async (): Promise<AuthStore> => {
    let content: string;
    try {
        content = await Bun.file(getAuthFilePath()).text();
    } catch (error) {
        const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : undefined;
        if (code === 'ENOENT') throw authError('auth file not found');
        throw authError('unable to read auth file');
    }

    try {
        return JSON.parse(content) as AuthStore;
    } catch {
        throw authError('invalid auth file');
    }
};

const decodeJwtPayload = (token: string): JwtClaims => {
    const [, payload] = token.split('.');
    if (!payload) return {};
    const normalized = payload.replaceAll('-', '+').replaceAll('_', '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    try {
        return JSON.parse(globalThis.atob(padded)) as JwtClaims;
    } catch {
        return {};
    }
};

const getChatgptAccountId = (auth: OpenAiAuth) => {
    const direct = [auth.accountId, auth.account_id, auth.chatgptAccountId, auth.chatgpt_account_id].find(nonEmptyString);
    if (direct) return direct;
    if (!auth.access) return undefined;

    const claims = decodeJwtPayload(auth.access);
    const claim = claims['https://api.openai.com/auth.chatgpt_account_id'];
    if (nonEmptyString(claim)) return claim;
    if (nonEmptyString(claims.chatgpt_account_id)) return claims.chatgpt_account_id;

    const nestedAuth = claims['https://api.openai.com/auth'];
    if (nestedAuth && typeof nestedAuth === 'object' && 'chatgpt_account_id' in nestedAuth) {
        const nestedClaim = nestedAuth.chatgpt_account_id;
        if (nonEmptyString(nestedClaim)) return nestedClaim;
    }
    return undefined;
};

const fetchUsageEndpoint = async (endpoint: string, account: AccountConfig): Promise<UsageResponse> => {
    if (!account.accountId) throw authError('missing account id');

    const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${account.access}`,
            'Content-Type': 'application/json',
            'User-Agent': 'codex_cli_rs/0.136.0 (WindowsTerminal)',
            'ChatGPT-Account-Id': account.accountId
        }
    });
    if (response.status !== 200) throw authError(`upstream ${response.status}`);

    const body = await response.text();
    if (!body.trim()) throw authError('empty quota response');

    try {
        return JSON.parse(body) as UsageResponse;
    } catch {
        throw authError('invalid quota json');
    }
};

const usageEndpointForBaseUrl = (baseUrl: string) => {
    if (baseUrl.includes('/backend-api')) return `${baseUrl}/wham/usage`;
    return `${baseUrl}/api/codex/usage`;
};

const usageEndpoint = () => usageEndpointForBaseUrl(CHATGPT_BACKEND_BASE_URL);

const windowRemaining = (window: RateLimitWindow | undefined) => remainingPercent(window?.used_percent);

const windowResetIn = (window: RateLimitWindow | undefined) => formatResetIn(window?.reset_after_seconds);

const quotaFromUsage = (usage: UsageResponse): AccountQuota | undefined => {
    const rateLimit = usage.rate_limit;
    if (!rateLimit) return undefined;

    const primary = rateLimit.primary_window;
    const secondary = rateLimit.secondary_window;
    if (!primary && !secondary) return undefined;

    return {
        email: nonEmptyString(usage.email) ? usage.email : undefined,
        primaryRemaining: windowRemaining(primary),
        primaryResetIn: windowResetIn(primary),
        secondaryRemaining: windowRemaining(secondary),
        secondaryResetIn: windowResetIn(secondary)
    };
};

const emptyQuota = (error: string): AccountQuota => ({ primaryResetIn: '?', secondaryResetIn: '?', error });

const fetchAccountQuota = async (account: AccountConfig): Promise<AccountQuota> => {
    try {
        const quota = quotaFromUsage(await fetchUsageEndpoint(usageEndpoint(), account));
        return quota ?? emptyQuota('missing rate_limit');
    } catch (error) {
        return emptyQuota(errorMessage(error));
    }
};

const fetchAccountEmail = async (account: AccountConfig) => {
    try {
        const usage = await fetchUsageEndpoint(usageEndpoint(), account);
        return nonEmptyString(usage.email) ? usage.email : undefined;
    } catch {
        return undefined;
    }
};

const fetchAccountQuotas = async (accounts: Record<string, AccountConfig>) => {
    const entries = await Promise.all(Object.entries(accounts).map(async ([id, account]) => [id, await fetchAccountQuota(account)] as const));
    return Object.fromEntries(entries) as Record<string, AccountQuota>;
};

const accountName = (account: AccountConfig | undefined, id: string, quota?: AccountQuota) => firstNonEmptyString(quota?.email, account?.email, account?.label, id) ?? id;

const accountUsername = (account: AccountConfig | undefined, id: string, quota?: AccountQuota) => {
    const value = accountName(account, id, quota);
    const [username] = value.split('@');
    return username || value;
};

const truncateText = (value: string, max: number) => {
    if (value.length <= max) return value;
    return `${value.slice(0, Math.max(1, max - 1))}…`;
};

const compactAccountName = (account: AccountConfig | undefined, id: string, quota?: AccountQuota) => truncateText(accountUsername(account, id, quota), 20);

const accountQuotaKey = (accounts: Record<string, AccountConfig>) =>
    Object.entries(accounts)
        .map(([id, account]) => `${id}:${account.accountId ?? ''}:${account.expires ?? ''}`)
        .join('|');

const stateWithQuotaEmails = (current: MultiAuthState, nextQuotas: Record<string, AccountQuota>) => {
    let accounts = current.accounts;

    for (const [id, quota] of Object.entries(nextQuotas)) {
        const account = accounts[id];
        if (!account) continue;
        if (!nonEmptyString(quota.email)) continue;
        if (account.email === quota.email) continue;

        if (accounts === current.accounts) accounts = { ...current.accounts };
        accounts[id] = { ...account, email: quota.email, label: account.label || quota.email };
    }

    return accounts === current.accounts ? undefined : { ...current, accounts };
};

const stopMouse = (event: MouseControlEvent) => {
    event.stopPropagation();
    event.preventDefault?.();
};

const setOpenAiAuth = async (api: TuiPluginApi, account: AccountConfig) => {
    if (!account.refresh || typeof account.expires !== 'number' || !account.accountId) {
        throw authError('account has incomplete oauth data');
    }

    await api.client.auth.set({
        providerID: 'openai',
        auth: {
            type: 'oauth',
            access: account.access,
            refresh: account.refresh,
            expires: account.expires,
            accountId: account.accountId
        }
    });
    await api.client.instance.dispose();
};

const removeOpenAiAuth = async (api: TuiPluginApi) => {
    await api.client.auth.remove({ providerID: 'openai' });
    await api.client.instance.dispose();
};

const isOpenAiOAuthAuth = (auth: OpenAiAuth | undefined): auth is OpenAiOAuthAuth => auth?.type === 'oauth' && nonEmptyString(auth.access);

const authorizeOpenAiOAuth = async (api: TuiPluginApi, logPath: string) => {
    const result = await api.client.provider.oauth.authorize({ providerID: 'openai', method: 0 });
    const authorizeError = result.error;
    if (authorizeError) {
        await appendDebugLog(logPath, `\n[${new Date().toISOString()}] OAuth authorize error:\n${JSON.stringify(authorizeError, null, 2)}\n`);
        api.ui.toast({ variant: 'error', message: `Auth failed: ${oauthErrorMessage(authorizeError)}` });
        return undefined;
    }

    const authorization = result.data;
    if (authorization?.method !== 'auto' || !authorization.url) {
        api.ui.toast({ variant: 'error', message: 'Unsupported OAuth method' });
        return undefined;
    }

    return authorization.url;
};

const completeOpenAiOAuth = async (api: TuiPluginApi) => {
    const callbackResult = await api.client.provider.oauth.callback({ providerID: 'openai', method: 0 });
    const callbackError = callbackResult.error;
    if (callbackError) {
        api.ui.toast({ variant: 'error', message: `OAuth failed: ${oauthErrorMessage(callbackError)}` });
        return false;
    }

    await api.client.instance.dispose();
    return true;
};

const openOAuthUrl = async (api: TuiPluginApi, url: string) => {
    api.ui.toast({ variant: 'info', message: 'Opening browser...' });
    if (await openExternalUrl(url)) return true;

    api.ui.toast({ variant: 'error', message: 'Cannot open browser' });
    return false;
};

const buildAccountFromAuth = async (auth: OpenAiOAuthAuth): Promise<AccountConfig | undefined> => {
    const accountId = getChatgptAccountId(auth);
    const expires = toNumber(auth.expires);
    if (!nonEmptyString(auth.refresh) || typeof expires !== 'number' || !accountId) return undefined;

    const email = await fetchAccountEmail({ access: auth.access, accountId });
    return { access: auth.access, refresh: auth.refresh, expires, accountId, email };
};

const readOpenAiOAuthAccount = async (api: TuiPluginApi) => {
    const auth = (await readAuthStore()).openai;
    if (!isOpenAiOAuthAuth(auth)) {
        api.ui.toast({ variant: 'error', message: 'Auth data not found after OAuth' });
        return undefined;
    }

    const account = await buildAccountFromAuth(auth);
    if (!account) {
        api.ui.toast({ variant: 'error', message: 'OAuth account data incomplete' });
        return undefined;
    }

    return account;
};

const QuotaDetails = (props: QuotaDetailsProps) => {
    const quotaError = () => {
        if (props.loading) return undefined;
        return props.quota?.error;
    };
    const visibleQuota = () => {
        if (props.loading) return undefined;
        if (props.quota?.error) return undefined;
        return props.quota;
    };

    return (
        <box flexDirection='column' gap={0}>
            <Show when={props.loading}>
                <text fg={props.muted} selectable={false} wrapMode='none'>
                    loading…
                </text>
            </Show>
            <Show when={quotaError()}>
                {(message) => (
                    <text fg={props.error} selectable={false} wrapMode='none'>
                        err · {truncateText(message(), 18)}
                    </text>
                )}
            </Show>
            <Show when={visibleQuota()}>
                {(quota) => (
                    <box flexDirection='column' gap={0}>
                        <text fg={remainingColor(quota().primaryRemaining, props.theme)} selectable={false} wrapMode='none'>
                            day {percent(quota().primaryRemaining)} · {quota().primaryResetIn}
                        </text>
                        <text fg={remainingColor(quota().secondaryRemaining, props.theme)} selectable={false} wrapMode='none'>
                            week {percent(quota().secondaryRemaining)} · {quota().secondaryResetIn}
                        </text>
                    </box>
                )}
            </Show>
        </box>
    );
};

const AccountRow = (props: AccountRowProps) => {
    const [accountHover, setAccountHover] = createSignal(false);
    const [deleteHover, setDeleteHover] = createSignal(false);
    const isActive = () => props.active;
    const rowColor = () => (isActive() ? props.success : props.muted);
    const accountTextColor = () => (accountHover() || isActive() ? props.text : props.muted);

    return (
        <box flexDirection='row' gap={1} paddingY={1} paddingLeft={1} paddingRight={1} border={['left']} borderColor={rowColor()} backgroundColor={props.inputBackground}>
            <box
                flexDirection='column'
                gap={0}
                flexGrow={1}
                onMouseOver={() => setAccountHover(true)}
                onMouseOut={() => setAccountHover(false)}
                onMouseDown={(event) => {
                    stopMouse(event);
                    props.onSwitch(props.id);
                }}
            >
                <box flexDirection='row' gap={1} justifyContent='space-between' alignItems='center'>
                    <box flexDirection='row' gap={1} flexGrow={1}>
                        <text fg={isActive() ? props.success : props.muted} selectable={false}>
                            {isActive() ? '◉' : '○'}
                        </text>
                        <text fg={accountTextColor()} selectable={false} wrapMode='none' flexGrow={1}>
                            <b>{compactAccountName(props.account, props.id, props.quota)}</b>
                        </text>
                    </box>
                    <box
                        width={3}
                        height={1}
                        alignItems='center'
                        justifyContent='center'
                        onMouseOver={() => setDeleteHover(true)}
                        onMouseOut={() => setDeleteHover(false)}
                        onMouseDown={(event) => {
                            stopMouse(event);
                            props.onDelete(props.id);
                        }}
                    >
                        <text fg={deleteHover() ? props.error : props.muted} selectable={false}>
                            
                        </text>
                    </box>
                </box>
                <QuotaDetails loading={props.quotasLoading} quota={props.quota} theme={props.theme} muted={props.muted} error={props.error} />
            </box>
        </box>
    );
};

const AccountManager = (props: { api: TuiPluginApi; theme: Record<string, unknown> }) => {
    const muted = themeColor(props.theme, ['textMuted', 'muted'], '#6272A4');
    const text = color(props.theme, 'text', '#F8F8F2');
    const success = color(props.theme, 'success', '#50FA7B');
    const warning = color(props.theme, 'warning', '#FFB86C');
    const error = color(props.theme, 'error', '#FF5555');
    const panel = color(props.theme, 'backgroundPanel', '#282A36');
    const inputBackground = color(props.theme, 'backgroundElement', '#44475A');

    const [open, setOpen] = createSignal(false);
    const [quotaRefresh, setQuotaRefresh] = createSignal(0);
    const [refreshHover, setRefreshHover] = createSignal(false);
    const [addHover, setAddHover] = createSignal(false);
    const [state, setState] = createSignal<MultiAuthState>(props.api.kv.get('codex-manager-state', props.api.kv.get('multi-auth-state', { accounts: {}, active: '' })));
    const [quotas] = createResource(
        () => (open() ? `${quotaRefresh()}:${accountQuotaKey(state().accounts)}` : undefined),
        () => fetchAccountQuotas(state().accounts)
    );
    const accountEntries = createMemo(() => Object.entries(state().accounts));
    const accountCount = createMemo(() => accountEntries().length);
    const activeAccount = createMemo(() => {
        const current = state();
        return current.accounts[current.active];
    });
    const closedSummary = createMemo(() => {
        const count = accountCount();
        if (count === 0) return 'no accounts';
        const activeId = state().active;
        const activeName = compactAccountName(activeAccount(), activeId || 'active', quotas()?.[activeId]);
        const extraCount = count - 1;
        if (extraCount === 0) return activeName;
        return `${activeName} +${extraCount}`;
    });

    const saveState = (next: MultiAuthState) => {
        setState(next);
        props.api.kv.set('codex-manager-state', next);
        props.api.kv.set('multi-auth-state', next);
    };

    createEffect(() => {
        const nextQuotas = quotas();
        if (!nextQuotas || quotas.loading) return;

        const nextState = stateWithQuotaEmails(state(), nextQuotas);
        if (nextState) saveState(nextState);
    });

    const refreshQuotas = () => {
        if (!open()) {
            setOpen(true);
            return;
        }
        setQuotaRefresh((value) => value + 1);
    };

    const switchAccount = async (id: string) => {
        if (state().active === id) return;

        const account = state().accounts[id];
        if (!account) {
            props.api.ui.toast({ variant: 'error', message: `Account ${id} not found` });
            return;
        }

        try {
            await setOpenAiAuth(props.api, account);
            saveState({ ...state(), active: id });
            props.api.ui.toast({ variant: 'success', message: `Switched to ${accountName(account, id)}` });
        } catch (err) {
            props.api.ui.toast({ variant: 'error', message: `Switch failed: ${errorMessage(err)}` });
        }
    };

    const deleteAccount = async (id: string) => {
        const current = state();
        const account = current.accounts[id];
        if (!account) return;

        const accounts = { ...current.accounts };
        delete accounts[id];

        try {
            if (current.active !== id) {
                saveState({ ...current, accounts });
                props.api.ui.toast({ variant: 'success', message: `Deleted ${accountName(account, id)}` });
                return;
            }

            const nextActive = Object.keys(accounts)[0] || '';
            if (nextActive) {
                await setOpenAiAuth(props.api, accounts[nextActive]);
                saveState({ accounts, active: nextActive });
                props.api.ui.toast({ variant: 'success', message: `Deleted ${accountName(account, id)}; switched account` });
                return;
            }

            await removeOpenAiAuth(props.api);
            saveState({ accounts, active: '' });
            props.api.ui.toast({ variant: 'success', message: `Deleted ${accountName(account, id)}` });
        } catch (err) {
            props.api.ui.toast({ variant: 'error', message: `Delete failed: ${errorMessage(err)}` });
        }
    };

    const switchAccountFromRow = (id: string) => {
        switchAccount(id).catch((err) => props.api.ui.toast({ variant: 'error', message: `Switch failed: ${errorMessage(err)}` }));
    };

    const deleteAccountFromRow = (id: string) => {
        deleteAccount(id).catch((err) => props.api.ui.toast({ variant: 'error', message: `Delete failed: ${errorMessage(err)}` }));
    };

    const addAccount = async () => {
        try {
            const logPath = userConfigPath('oauth-debug.log');
            const authorizationUrl = await authorizeOpenAiOAuth(props.api, logPath);
            if (!authorizationUrl) return;
            if (!(await openOAuthUrl(props.api, authorizationUrl))) return;

            props.api.ui.toast({ variant: 'info', message: 'Waiting for browser auth...' });
            if (!(await completeOpenAiOAuth(props.api))) return;

            const account = await readOpenAiOAuthAccount(props.api);
            if (!account) {
                return;
            }

            const nextAccountNumber = Object.keys(state().accounts).length + 1;
            const accountKey = `openai-${Date.now()}`;
            const label = account.email || `OpenAI ${nextAccountNumber}`;
            const accounts = {
                ...state().accounts,
                [accountKey]: {
                    ...account,
                    label
                }
            };

            saveState({ accounts, active: accountKey });
            props.api.ui.toast({ variant: 'success', message: `Added ${label}` });
        } catch (err) {
            props.api.ui.toast({ variant: 'error', message: `Error: ${errorMessage(err)}` });
        }
    };

    const addAccountFromButton = () => {
        addAccount().catch((err) => props.api.ui.toast({ variant: 'error', message: `Error: ${errorMessage(err)}` }));
    };

    const accountRowProps = (id: string, account: AccountConfig): AccountRowProps => ({
        id,
        account,
        active: state().active === id,
        quota: quotas()?.[id],
        quotasLoading: quotas.loading,
        theme: props.theme,
        muted,
        text,
        success,
        error,
        inputBackground,
        onSwitch: switchAccountFromRow,
        onDelete: deleteAccountFromRow
    });

    const renderAccountRow = ([id, account]: [string, AccountConfig]) => <AccountRow {...accountRowProps(id, account)} />;

    return (
        <box flexDirection='column' gap={1}>
            <box
                flexDirection='row'
                gap={1}
                onMouseDown={(event) => {
                    stopMouse(event);
                    setOpen((value) => !value);
                }}
            >
                <text fg={text}>{open() ? '▼' : '▶'}</text>
                <text fg={text}>
                    <b>Codex Manager</b>
                    <Show when={!open()}>
                        <span style={{ fg: muted }}> ({closedSummary()})</span>
                    </Show>
                </text>
            </box>
            <Show when={open()}>
                <box flexDirection='column' gap={0} paddingTop={1} paddingBottom={1} paddingLeft={1} paddingRight={1} border={['top', 'bottom', 'left', 'right']} borderColor={muted} backgroundColor={panel}>
                    <box flexDirection='row' gap={1} paddingBottom={1} alignItems='center' justifyContent='space-between'>
                        <box flexGrow={1}>
                            <text fg={text}>
                                <b>Accounts</b>
                                <span style={{ fg: muted }}> {accountCount()}</span>
                            </text>
                        </box>
                        <box flexDirection='row' gap={1}>
                            <box
                                paddingLeft={1}
                                paddingRight={1}
                                onMouseOver={() => setRefreshHover(true)}
                                onMouseOut={() => setRefreshHover(false)}
                                onMouseDown={(event) => {
                                    stopMouse(event);
                                    refreshQuotas();
                                }}
                            >
                                <text fg={quotas.loading ? warning : refreshHover() ? text : muted} selectable={false}>
                                    
                                </text>
                            </box>
                            <box
                                paddingLeft={1}
                                paddingRight={1}
                                onMouseOver={() => setAddHover(true)}
                                onMouseOut={() => setAddHover(false)}
                                onMouseDown={(event) => {
                                    stopMouse(event);
                                    addAccountFromButton();
                                }}
                            >
                                <text fg={addHover() ? text : success} selectable={false}>
                                    
                                </text>
                            </box>
                        </box>
                    </box>
                    <Show when={accountEntries().length > 0} fallback={<text fg={muted}>no accounts configured</text>}>
                        <box flexDirection='column' gap={1}>
                            <For each={accountEntries()}>{renderAccountRow}</For>
                        </box>
                    </Show>
                </box>
            </Show>
        </box>
    );
};

const tui: TuiPlugin = async (api) => {
    api.slots.register({
        order: 250,
        slots: {
            sidebar_content() {
                return <AccountManager api={api} theme={api.theme.current} />;
            }
        }
    });
};

const plugin: TuiPluginModule & { id: string } = {
    id: 'codex-manager',
    tui
};

export default plugin;
