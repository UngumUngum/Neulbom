const openAiApiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;

if (!openAiApiKey) {
  console.warn(
    'OpenAI API 키가 설정되지 않았습니다. .env 파일에 EXPO_PUBLIC_OPENAI_API_KEY를 추가해 주세요.',
  );
}

export async function generateWarmCareNote({ content }) {
  if (!openAiApiKey) {
    throw new Error('OpenAI API 키가 설정되지 않았습니다.');
  }

  if (!content?.trim()) {
    throw new Error('변환할 활동일지 내용이 비어 있습니다.');
  }

  const prompt = `다음은 돌봄자가 간단히 메모한 활동 기록입니다. 장애인복지관, 요양원, 어린이집 등 다양한 돌봄 환경에서 보호자에게 공유할 수 있도록,
다정하고 따뜻하지만 과도하게 형식적이지 않은 말투로 자연스럽게 정리해 주세요.

작성 시 지켜야 할 점:
- 사실 관계는 바꾸지 말고, 핵심 내용을 명확히 전달합니다.
- 지나치게 장황한 표현이나 과한 감탄은 피하고, 진심 어린 돌봄의 태도를 담습니다.
- 상황 설명 → 돌봄자의 관찰/느낌 → 보호자에게 전하고 싶은 당부나 응원의 한마디 순으로 2~3단락 정도로 구성하면 좋습니다.
- 문장 길이는 읽기 쉽게 조절해 주세요.

활동 기록 원문:
${content.trim()}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openAiApiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            '당신은 유아 돌봄 교사가 보호자에게 보내는 활동일지를 자연스럽고 따뜻한 말투로 다듬어 주는 어시스턴트입니다.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.6,
    }),
  });

  if (!response.ok) {
    const errorPayload = await response.text();
    throw new Error('OpenAI API 호출에 실패했습니다: ' + errorPayload);
  }

  const data = await response.json();
  const aiContent = data?.choices?.[0]?.message?.content?.trim();

  if (!aiContent) {
    throw new Error('AI 응답이 비어 있습니다.');
  }

  return aiContent;
}

export default {
  generateWarmCareNote,
};


