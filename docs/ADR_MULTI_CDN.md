# ADR: Multi-CDN (SCL-016)

**Status:** **Won't do** until geo pain is measured after HLS-on-R2/CDN (SCL-012).  
**Date:** 2026-09-06

## Context

LiveStream serves VOD HLS via Cloudflare (cache + optional R2 public domain). Multi-CDN (geo steering, dual origins) adds cache-key and ops complexity.

## Decision

Do **not** implement multi-CDN in the current backlog.

Revisit only when **after SCL-012** we have regional evidence of:

- High RTT / rebuffer concentrated in specific geos
- CF/R2 edge insufficient for those regions

## Consequences

- Keep one CF (and R2 custom domain) cache key story.
- If revisit: write a child plan for dual origin URL or DNS steering; canary A/B HIT + QoE before cutover.

## References

- [`SCALING_IMPLEMENTATION_PLAN.md`](./SCALING_IMPLEMENTATION_PLAN.md) SCL-016
- [`SCALING_STRATEGY.md`](./SCALING_STRATEGY.md) §6
