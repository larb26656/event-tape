# Tech stack

Status: ready-for-agent

เอกสารประกอบ spec.md ที่ผู้ใช้ยืนยันแล้ว ยังไม่เริ่ม implementation

## Confirmed decisions

- TypeScript และ Node.js; minimum Node.js 22 สำหรับ Recorder SDK และ Viewer CLI
- pnpm workspaces และ Turborepo จัดการ monorepo
- แยก Recorder SDK และ Viewer CLI เป็นคนละ package
- Viewer ใช้ React + Vite + TypeScript; build เป็น static assets ให้ CLI serve ไม่ใช้ Vite dev server ใน production และไม่ใช้ SSR
- Recorder SDK เป็น ESM-only พร้อม TypeScript declarations; ไม่รับรอง CommonJS require โดยตรงใน MVP
- Recorder SDK ไม่มี runtime dependencies ใช้ Node built-ins สำหรับไฟล์ เวลา และ write queue; Viewer เลือก dependencies แยกได้
- ยังไม่ pin เวอร์ชันเครื่องมือ จนกว่าจะตรวจ compatibility กับ minimum Node.js
- UI ใช้ Tailwind CSS + shadcn/ui ไม่ใช้ CSS Modules เป็นแนวทางหลัก
- ก่อนทำ custom UI ต้องค้นหา component ใน shadcn ก่อน หากไม่มีให้ประกอบจาก component ที่มี; ส่วนที่จำเป็นต้อง custom ใช้ style และ semantic tokens ให้สอดคล้องกับ shadcn
- Playback state ใช้ Zustand; logic ของ clock และการหา event ตามเวลาแยกจาก React
- CLI ใช้ Node `http` built-in ให้บริการ assets และ recording ที่ระบุ ไม่เปิด arbitrary filesystem path จาก request
- Parse JSONL ใน Web Worker และโหลดครบก่อน playback
- ใช้ TanStack Virtual สำหรับรายการ event โดย timeline วาดภาพรวมแยกจากรายการ
- ใช้ Vitest สำหรับ SDK, parser และ playback logic; ทดสอบ filesystem จริงใน temporary directory
- Smoke ผ่าน CLI และ browser จริง; ยังไม่เพิ่ม Playwright/E2E automation ใน MVP
- เพิ่ม private workspace package `recording-format` สำหรับ JSONL types และ envelope validation ที่ใช้ร่วมกัน โดยไม่มี Node filesystem, React หรือ protocol-specific logic
- Bundle shared recording contract เข้า SDK/Viewer ที่แจก ไม่เพิ่ม runtime dependency ของ SDK และไม่เผยแพร่ private package แยก
- ใช้ ESLint + typescript-eslint + React Hooks rules และ Prettier พร้อม Tailwind class sorting
- แยก `typecheck`, `lint`, `test`, `build` เป็น Turborepo tasks
- ใช้ tsdown build SDK/types และ CLI เป็น ESM โดยรวม shared recording contract เข้า output
- ใช้ Vite build เว็บและ Web Worker; รวม static assets ใน Viewer CLI package
- SDK declarations ต้องไม่อ้าง private workspace package
- ใช้ `tsc --noEmit` สำหรับ typecheck แยกจาก build
- ตรวจ package ที่ pack แล้วจากโปรเจกต์ภายนอก monorepo ทั้ง SDK import/types และ CLI/assets

## Required initialization workflow

- การสร้าง monorepo, app และ package ทุกตัวต้องใช้ CLI init/scaffolding ของ tooling ที่เกี่ยวข้อง ไม่เขียนโครงเริ่มต้นหรือไฟล์ scaffold ขึ้นเอง
- ใช้ pnpm เป็น package runner และตรวจคำสั่ง/ตัวเลือกจาก tooling จริงก่อนรัน
- ตั้งค่า shadcn ผ่าน CLI และค้นหา component ก่อน custom ตามกติกา UI ข้างต้น
- หลัง CLI init แล้วจึงปรับ generated project ให้ตรง requirements และพัฒนา implementation
- ถ้า CLI ไม่มีความสามารถที่จำเป็นหรือใช้งานไม่ได้ ให้แจ้งข้อจำกัดและตกลงวิธีต่อกับผู้ใช้ก่อน ไม่ fallback ไปสร้าง scaffold เอง


## Build tooling evidence

- tsdown รองรับการ generate และ bundle declarations: https://tsdown.dev/options/dts
- tsdown กำหนดให้ bundle dependency ที่เลือกได้ และใช้กฎเดียวกันกับ declarations: https://tsdown.dev/options/dependencies
- ผู้ใช้เลือก tsdown หลังพิจารณา tsup แล้ว; เวอร์ชันและ Node.js engine compatibility ยังไม่ได้ตรวจด้วยการติดตั้งหรือ build จริง
- tsup รองรับ ESM และ `.d.ts` แต่ upstream ระบุว่าไม่ actively maintained และแนะนำ tsdown: https://github.com/egoist/tsup
- เอกสาร tsup ระบุว่า `--dts` ไม่ resolve external types โดยปริยาย จึงต้องตรวจว่า declarations ไม่อ้าง private workspace package: https://github.com/egoist/tsup/blob/main/docs/README.md

## Final agreement

ผู้ใช้ยืนยัน tech stack ฉบับรวมและเพิ่มข้อบังคับ CLI-only initialization แล้ว ปิดรอบ tech stack design โดยยังไม่ติดตั้ง dependencies, init project หรือเริ่ม implementation
