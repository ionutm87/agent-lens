// Cost of a step at its real model. USD per million tokens (claude-api skill, 2026-10-06); cache writes at 1h TTL,
// as Claude Code runs. Haiku costs 5x above 100K prompt tokens. On a subscription this is a measure, not the bill.
export type Tier = 'opus' | 'sonnet' | 'haiku'

export const PRICES: Record<Tier, { input: number; output: number; write: number; read: number }> = {
  opus: { input: 4, output: 20, write: 8, read: 0.2 },
  sonnet: { input: 2, output: 10, write: 4, read: 0.2 },
  haiku: { input: 0.1, output: 0.5, write: 0.2, read: 0.01 },
}

export const tierOf = (model: string): Tier | undefined => /opus|sonnet|haiku/i.exec(model)?.[0].toLowerCase() as Tier | undefined

type Usage = { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }

export const costOf = (tier: Tier, u: Usage) => {
  const p = PRICES[tier]
  const prompt = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
  const long = tier === 'haiku' && prompt > 100_000 ? 5 : 1

  return (long * (u.input_tokens * p.input + u.cache_creation_input_tokens * p.write + u.cache_read_input_tokens * p.read + u.output_tokens * p.output)) / 1e6
}
