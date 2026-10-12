import { useEffect, useState } from "react";
import { KeyRound, Loader2, Plug, Save, Sparkles } from "lucide-react";
import {
  useAiConfig,
  useTestAiConfig,
  useUpdateAiConfig,
} from "@/features/settings/hooks/useAiConfig";
import type { AiConfigUpdateRequest } from "@/shared/types";

type AiProtocol = "openai" | "anthropic";

interface PresetVariant {
  protocol: AiProtocol;
  baseUrl: string;
  model: string;
}

const PRESETS: { label: string; variants: PresetVariant[] }[] = [
  {
    label: "智谱 GLM",
    variants: [
      {
        protocol: "anthropic",
        baseUrl: "https://open.bigmodel.cn/api/anthropic",
        model: "glm-5.3",
      },
      {
        protocol: "openai",
        baseUrl: "https://open.bigmodel.cn/api/paas/v4",
        model: "glm-5.3",
      },
    ],
  },
  {
    label: "Kimi",
    variants: [
      {
        protocol: "anthropic",
        baseUrl: "https://api.moonshot.cn/anthropic",
        model: "kimi-k3",
      },
      {
        protocol: "openai",
        baseUrl: "https://api.moonshot.cn/v1",
        model: "kimi-k3",
      },
    ],
  },
  {
    label: "DeepSeek",
    variants: [
      {
        protocol: "anthropic",
        baseUrl: "https://api.deepseek.com/anthropic",
        model: "deepseek-chat",
      },
      {
        protocol: "openai",
        baseUrl: "https://api.deepseek.com/v1",
        model: "deepseek-chat",
      },
    ],
  },
  {
    label: "MiniMax",
    variants: [
      {
        protocol: "anthropic",
        baseUrl: "https://api.minimaxi.com/anthropic",
        model: "MiniMax-M3",
      },
      {
        protocol: "openai",
        baseUrl: "https://api.minimaxi.com/v1",
        model: "MiniMax-M3",
      },
    ],
  },
  {
    label: "Ollama",
    variants: [
      {
        protocol: "openai",
        baseUrl: "http://localhost:11434/v1",
        model: "qwen3:8b",
      },
    ],
  },
];

export function AiConfigCard() {
  const { data, isLoading, isError } = useAiConfig();
  const update = useUpdateAiConfig();
  const test = useTestAiConfig();

  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [protocol, setProtocol] = useState<"openai" | "anthropic">("openai");
  const [apiKey, setApiKey] = useState("");
  const [clearApiKey, setClearApiKey] = useState(false);
  const [timeoutSeconds, setTimeoutSeconds] = useState(180);
  const [maxTokens, setMaxTokens] = useState(4000);
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (data) {
      setBaseUrl(data.base_url);
      setModel(data.model);
      setProtocol(data.protocol);
      setTimeoutSeconds(data.timeout_seconds);
      setMaxTokens(data.max_tokens);
      setEnabled(data.enabled);
    }
  }, [data]);

  const handleSave = () => {
    const body: AiConfigUpdateRequest = {
      base_url: baseUrl.trim(),
      model: model.trim(),
      protocol,
      timeout_seconds: timeoutSeconds,
      max_tokens: maxTokens,
      enabled,
    };
    if (apiKey.trim()) {
      body.api_key = apiKey.trim();
    } else if (clearApiKey) {
      body.clear_api_key = true;
    }
    setApiKey("");
    setClearApiKey(false);
    update.mutate(body);
  };

  const handleTest = () => {
    test.mutate();
  };

  const configured = data?.configured ?? false;
  const savePending = update.isPending;
  const testPending = test.isPending;

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> AI 服务配置
          </div>
          <div className="card-subtitle">
            OpenAI 兼容或 Anthropic
            协议端点，用于补丁构建时 AI 起草 changelog；未配置或生成失败时自动回退代码模板
          </div>
        </div>
        <span className={`badge ${configured ? "badge-green" : "badge-gray"}`}>
          {configured ? "已配置" : "未配置"}
        </span>
      </div>

      <div className="card-body space-y-4">
        {isLoading && (
          <div className="py-6 text-center text-sm text-text-secondary">
            加载中...
          </div>
        )}
        {isError && (
          <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            AI 配置加载失败，请确认后端服务正在运行
          </div>
        )}

        {data && (
          <>
            <div>
              <div className="mb-1.5 text-xs font-medium text-text-secondary">
                服务商预设（点击按协议快填；地址与模型均可手动修改，支持任意自定义端点）
              </div>
              <div className="space-y-1.5">
                {PRESETS.map((preset) => (
                  <div
                    key={preset.label}
                    className="flex items-center gap-2 text-xs"
                  >
                    <span className="w-20 shrink-0 text-text-secondary">
                      {preset.label}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {preset.variants.map((v) => (
                        <button
                          key={v.protocol}
                          type="button"
                          className="btn btn-sm px-2 py-0.5"
                          onClick={() => {
                            setProtocol(v.protocol);
                            setBaseUrl(v.baseUrl);
                            setModel(v.model);
                          }}
                          title={`${v.baseUrl} · ${v.model}`}
                        >
                          {v.protocol === "anthropic"
                            ? "Anthropic"
                            : "OpenAI 兼容"}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">
                  请求协议
                </label>
                <select
                  className="form-select w-full"
                  value={protocol}
                  onChange={(e) =>
                    setProtocol(e.target.value as "openai" | "anthropic")
                  }
                >
                  <option value="openai">
                    OpenAI 兼容（/chat/completions）
                  </option>
                  <option value="anthropic">
                    Anthropic（/v1/messages，Kimi 等）
                  </option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">
                  Base URL
                </label>
                <input
                  type="text"
                  className="form-input w-full font-mono text-xs"
                  placeholder={
                    protocol === "anthropic"
                      ? "https://api.moonshot.cn/anthropic"
                      : "https://open.bigmodel.cn/api/paas/v4"
                  }
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">
                  模型名称
                </label>
                <input
                  type="text"
                  className="form-input w-full font-mono text-xs"
                  placeholder="kimi-k3"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">
                  API Key
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  className="form-input w-full font-mono text-xs"
                  placeholder={
                    data.api_key_masked
                      ? `已保存 ${data.api_key_masked}，留空表示不修改`
                      : "sk-..."
                  }
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                {data.api_key_masked && (
                  <label className="mt-1.5 flex cursor-pointer items-center gap-2 text-xs text-text-secondary">
                    <input
                      type="checkbox"
                      checked={clearApiKey}
                      onChange={(e) => setClearApiKey(e.target.checked)}
                      className="h-3.5 w-3.5 accent-red-500"
                    />
                    清除已保存的密钥
                  </label>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-secondary">
                    请求超时（秒）
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={600}
                    step={10}
                    className="form-input w-full font-mono text-xs"
                    value={timeoutSeconds}
                    onChange={(e) => setTimeoutSeconds(Number(e.target.value))}
                  />
                  <div className="mt-1 text-[11px] text-text-tertiary">
                    10–600，大批次建议 ≥180
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-secondary">
                    最大 tokens
                  </label>
                  <input
                    type="number"
                    min={256}
                    max={32000}
                    step={256}
                    className="form-input w-full font-mono text-xs"
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(Number(e.target.value))}
                  />
                  <div className="mt-1 text-[11px] text-text-tertiary">
                    256–32000，AI 单次回复上限
                  </div>
                </div>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="h-4 w-4 accent-blue-500"
                />
                启用 AI 辅助生成 changelog
              </label>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSave}
                disabled={
                  savePending ||
                  !baseUrl.trim() ||
                  !model.trim() ||
                  timeoutSeconds < 10 ||
                  timeoutSeconds > 600 ||
                  maxTokens < 256 ||
                  maxTokens > 32000
                }
              >
                {savePending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> 保存中...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" /> 保存配置
                  </>
                )}
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={handleTest}
                disabled={testPending || !configured}
                title={configured ? "向端点发送最小请求验证连通性" : "请先保存配置"}
              >
                {testPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> 测试中...
                  </>
                ) : (
                  <>
                    <Plug className="h-3.5 w-3.5" /> 测试连接
                  </>
                )}
              </button>
              {data.api_key_masked && (
                <span className="ml-auto flex items-center gap-1 font-mono text-[11px] text-text-tertiary">
                  <KeyRound className="h-3 w-3" /> {data.api_key_masked}
                </span>
              )}
            </div>

            {update.isError && (
              <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                保存失败：
                {update.error instanceof Error ? update.error.message : "未知错误"}
              </div>
            )}
            {update.isSuccess && !update.isPending && (
              <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
                配置已保存
              </div>
            )}

            {test.data && (
              <div
                className={`rounded-md border px-3 py-2 text-xs ${
                  test.data.ok
                    ? "border-success/30 bg-success/10 text-success"
                    : "border-danger/30 bg-danger/10 text-danger"
                }`}
              >
                {test.data.ok ? "连接成功，端点响应正常" : `连接失败：${test.data.error}`}
              </div>
            )}
            {test.isError && (
              <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                测试请求失败：
                {test.error instanceof Error ? test.error.message : "未知错误"}
              </div>
            )}

            {data.last_tested_at && (
              <div className="border-t border-border pt-2 text-[11px] text-text-tertiary">
                上次测试：
                <span
                  className={`ml-1 font-medium ${
                    data.last_test_status === "ok"
                      ? "text-success"
                      : "text-danger"
                  }`}
                >
                  {data.last_test_status === "ok" ? "成功" : "失败"}
                </span>
                <span className="ml-2">
                  {new Date(data.last_tested_at).toLocaleString()}
                </span>
                {data.last_test_status !== "ok" && data.last_test_error && (
                  <div className="mt-1 break-all">{data.last_test_error}</div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
