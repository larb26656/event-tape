# 07: แยกแพ็กเกจ CLI และเปิด Player จากการติดตั้งจริง

**Status:** resolved

**Spec:** [Separate CLI and Player packages and record HTTP traffic](../spec.md)

**What to build:** ติดตั้ง @event-tape/cli เพียงครั้งเดียวแล้วเปิด Recording ด้วย Player แบบ offline ได้จากนอก checkout โดยแยก CLI/Player เป็นคนละแพ็กเกจจริงและรักษา workflow เดิม

**Blocked by:** None (can start immediately)

## Acceptance criteria

- [ ] CLI เป็นเจ้าของ executable event-tape, command parsing, browser launch และ local servers; Player เหลือเว็บแอปและ built assets ไม่มี executable/server ซ้ำหรือ shim เก่า
- [ ] CLI มี runtime dependency ต่อ Player เวอร์ชันแน่นอนและหา asset root ผ่าน package contract ไม่ขึ้นกับ working directory หรือ source checkout; Player ไม่พึ่ง CLI
- [ ] Build/package รวม UI และ Worker ครบ ติดตั้งนอก workspace แล้วเปิด Recording แบบ offline ได้จริง ไม่มี CDN
- [ ] รักษา view, filename shorthand, browser-by-default และ no-browser; help/version และ invalid commands ไม่เปิด server หรือสร้าง Recording
- [ ] รักษา file picker, Worker parsing, search, Playback และ raw inspection; ไม่เปลี่ยน SDK runtime floor หรือ envelope v1; CLI คง Node >=22.12.0
- [ ] ปรับ workspace commands, build graph, package metadata, callers และ install/development docs ให้ใช้เจ้าของ executable ใหม่ทั้งหมด
- [ ] ตรวจ actual installed executable และ browser Player ด้วย Recording จริง รวมการโหลด Worker และการเปลี่ยนไฟล์; รัน relevant tests/typecheck/lint/build และบันทึกหลักฐานที่สังเกตจริง

## Answer

Implemented on `integration-cli-recording` in `e973464`. Packed CLI and Player were installed outside the workspace; Chromium loaded a Recording and Worker with external domains blocked, and file-picker replacement worked. Browser-by-default was launched but the resulting window could not be confirmed because browser target discovery timed out and macOS denied assistive access.
