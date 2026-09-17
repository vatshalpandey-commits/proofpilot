# ProofPilot

ProofPilot is a transparent research agent and a small agent framework built from scratch for the **Build the Brain, Not the Puppet** hackathon track.

The framework owns the complete `plan -> act -> observe -> repeat` loop. It lets an LLM choose between registered tools, validates each decision, records an inspectable execution trace, and feeds tool failures back to the agent so it can recover.

## Planned tools

- Web search
- Webpage reader
- Deterministic calculator

## Stack

- Next.js and TypeScript
- Tailwind CSS
- Gemini API for structured decisions
- Tavily API for web search
- Vercel for deployment

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Status

Phase 0 is complete: the repository and deployable Next.js foundation are ready. The custom agent loop and visual workspace are under development.
