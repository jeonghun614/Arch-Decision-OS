import Anthropic from "@anthropic-ai/sdk";

// 서버 전용 환경변수 로드 (.env.local, gitignored). 파일이 없으면 무시 —
// 배포 환경에서는 프로세스 환경변수를 그대로 쓴다.
try {
  process.loadEnvFile(".env.local");
} catch {
  // no .env.local — process.env만 사용
}

export const MODEL = "claude-sonnet-5";

let cached: Anthropic | null = null;

// 키가 없어도 서버 부팅은 되게 하고, 요청 시점에 명확한 에러를 낸다 (스펙 §9)
export function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "서버에 ANTHROPIC_API_KEY가 설정되지 않았습니다. .env.local 파일에 키를 추가하세요."
    );
  }
  cached ??= new Anthropic(); // ANTHROPIC_API_KEY를 env에서 자동 인식
  return cached;
}

interface StructuredArgs {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  effort?: "low";
}

function extractText(res: Anthropic.Message): string {
  if (res.stop_reason === "refusal") {
    throw new Error("모델이 이 요청의 처리를 거부했습니다.");
  }
  if (res.stop_reason === "max_tokens") {
    throw new Error("응답이 최대 토큰 한도에서 잘렸습니다. 다시 시도해주세요.");
  }
  const block = res.content.find((b) => b.type === "text");
  if (!block || block.type !== "text" || !block.text.trim()) {
    throw new Error("모델이 빈 응답을 반환했습니다.");
  }
  return block.text;
}

export async function structuredCall<T>(args: StructuredArgs): Promise<T> {
  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: args.system,
    messages: [{ role: "user", content: args.user }],
    output_config: {
      format: { type: "json_schema", schema: args.schema },
      ...(args.effort ? { effort: args.effort } : {}),
    },
  });
  return JSON.parse(extractText(res)) as T;
}

export async function textCall(args: { user: string; effort?: "low" }): Promise<string> {
  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: 16000,
    messages: [{ role: "user", content: args.user }],
    ...(args.effort ? { output_config: { effort: args.effort } } : {}),
  });
  return extractText(res).trim();
}
