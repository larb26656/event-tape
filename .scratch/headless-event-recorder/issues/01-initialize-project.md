# 01: Initialize monorepo และ toolchain

**What to build:** เตรียม workspace ที่ build และเปิดหน้าเว็บเริ่มต้นได้จริงผ่าน tooling ที่ตกลง ยังไม่ทำ Recorder API, recording schema หรือ playback

**Blocked by:** None (can start immediately)

**Status:** resolved

## Context

ใช้ spec และ tech-stack ที่ยืนยันแล้วของ feature Headless Event Recorder & Viewer รวมศัพท์ใน GLOSSARY เป็นข้อตกลงร่วม; ไม่เปิด scope Replay Engine, protocol adapter หรือ E2E automation เพิ่ม ทุก app/package ที่สร้างต้อง init ผ่าน CLI เท่านั้น หาก CLI ทำไม่ได้ให้แจ้งผู้ใช้ก่อน ไม่สร้าง scaffold เอง

## Acceptance criteria

- [ ] ใช้ CLI init monorepo, Recorder SDK, Viewer และ private recording-format package; ใช้ pnpm workspaces และ Turborepo ไม่เขียน scaffold เอง
- [ ] ตรวจคำสั่ง CLI และ engine compatibility ก่อนเลือกและ pin เวอร์ชัน รองรับ minimum Node.js 22 ตามข้อตกลง
- [ ] ตั้ง TypeScript, tsdown สำหรับ SDK/CLI ESM และ declarations, Vite สำหรับ React/Web Worker พร้อม Tailwind และ shadcn ผ่าน CLI
- [ ] เตรียม Vitest, ESLint/typescript-eslint/React Hooks rules และ Prettier พร้อม Tailwind sorting; มี typecheck/lint/test/build tasks โดยไม่เพิ่ม dummy tests เพื่อให้เขียว
- [ ] รัน typecheck, lint, build และเปิดหน้าเว็บที่ CLI สร้างใน browser จริง; บันทึกผลที่สังเกตได้และคำสั่ง init
- [ ] ไม่สร้าง fake Recorder, schema หรือ playback implementation; SDK ไม่พ่วง runtime dependencies และแยกจาก Viewer
- [ ] บันทึกวิธีพัฒนาและรัน workspace; ยังไม่ถือว่าส่งมอบ behavior ของผลิตภัณฑ์
## Comments

Implemented on `feat/headless-event-recorder`. CLI-generated pnpm/Turborepo workspace, SDK, Viewer, and format package; Node 22 typecheck/lint/build and browser smoke passed.
