const API = (() => {
  async function fetchModels(provider) {
    const headers = { 'Content-Type': 'application/json' };
    if (provider.apiKey) headers['Authorization'] = `Bearer ${provider.apiKey}`;
    const res = await fetch(`${provider.baseUrl}/models`, { headers });
    if (!res.ok) throw new Error(`Failed to fetch models: ${res.status}`);
    const data = await res.json();
    return (data.data || data.models || []).map(m => typeof m === 'string' ? m : m.id).filter(Boolean);
  }

  async function* streamChat(provider, messages, model, options = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (provider.apiKey) headers['Authorization'] = `Bearer ${provider.apiKey}`;

    const body = {
      model: model || provider.defaultModel || 'llama-4-scout',
      messages,
      stream: true,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2048,
    };

    if (options.tools) {
      body.tools = options.tools;
      body.tool_choice = options.toolChoice || 'auto';
    }

    const res = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`API error ${res.status}: ${err}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (trimmed.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmed.slice(6));
            const delta = json.choices?.[0]?.delta;
            if (delta?.content) yield { type: 'text', content: delta.content };
            if (delta?.tool_calls) yield { type: 'tool_calls', tool_calls: delta.tool_calls };
          } catch {}
        }
      }
    }
  }

  async function chat(provider, messages, model, options = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (provider.apiKey) headers['Authorization'] = `Bearer ${provider.apiKey}`;

    const body = {
      model: model || provider.defaultModel || 'llama-4-scout',
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2048,
    };

    const res = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`API error ${res.status}: ${err}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  return { fetchModels, streamChat, chat };
})();
