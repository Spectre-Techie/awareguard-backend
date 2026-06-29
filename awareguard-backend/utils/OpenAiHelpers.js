// awareguard-backend/utils/OpenAiHelpers.js
import axios from 'axios';
import 'dotenv/config';

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

// CHANGED: Using 'openai/gpt-oss-120b:free' as the absolute default free model 
export async function chatHelper(message, model = 'openai/gpt-oss-120b:free') {
  const url = 'https://openrouter.ai/api/v1/chat/completions';
  try {
    const res = await axios.post(
      url,
      {
        model,
        messages: [
          { role: 'system', content: 'You are AwareGuard AI, a professional and user-friendly scam awareness assistant dedicated solely to educating users on scams and digital safety; provide detailed, accurate answers related to scam prevention, and if asked any question beyond your scope, politely respond that you are designed only for scam awareness and cannot assist with that topic, while also temporarily storing previous responses during a session to maintain conversational context and provide relevant, coherent answers to follow-up questions.' },
          message
        ],
        stream: false,
        max_tokens: 800,
        temperature: 0.7
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // RESTORED: Your pristine, original array payload destructuring logic
    const content = res.data.choices?.[0]?.message?.content;
    return { content: content || 'No reply from AI.' };
  } catch (e) {
    console.error('OpenRouter Error:', e.response?.data || e.message);
    throw new Error('AI failed to respond via OpenRouter.');
  }
}

