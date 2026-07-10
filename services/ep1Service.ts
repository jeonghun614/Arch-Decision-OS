import { BlueprintJSON, EP1ProgramTree } from "../types";

export async function runEP1ProgramTree(blueprint: BlueprintJSON): Promise<EP1ProgramTree> {
  let res: Response;
  try {
    res = await fetch("/api/ep1-program-tree", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ blueprint }),
    });
  } catch {
    throw new Error("AI 서버에 연결할 수 없습니다. `npm run dev`로 서버가 함께 실행 중인지 확인해주세요.");
  }
  if (!res.ok) {
    let message = `EP1 프로그램 트리 생성 실패 (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error?.message) message = data.error.message;
    } catch { /* 상태 코드 메시지 유지 */ }
    throw new Error(message);
  }
  return await res.json() as EP1ProgramTree;
}
