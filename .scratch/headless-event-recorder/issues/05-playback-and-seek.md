# 05: Playback และ seek แบบ timeline

**What to build:** ผู้ใช้เล่น หยุด เปลี่ยนความเร็ว และเลื่อนเวลาเพื่อตรวจเหตุการณ์ได้แบบ timeline โดยไม่ emit event เข้าระบบอื่น

**Blocked by:** 02: Record → close → เปิดตรวจใน Viewer

**Status:** resolved

## Context

ใช้ spec และ tech-stack ที่ยืนยันแล้วของ feature Headless Event Recorder & Viewer รวมศัพท์ใน GLOSSARY เป็นข้อตกลงร่วม; ไม่เปิด scope Replay Engine, protocol adapter หรือ E2E automation เพิ่ม ทุก app/package ที่สร้างต้อง init ผ่าน CLI เท่านั้น หาก CLI ทำไม่ได้ให้แจ้งผู้ใช้ก่อน ไม่สร้าง scaffold เอง

## Acceptance criteria

- [ ] ใช้ Zustand เป็นเจ้าของ playback state และแยก clock/event lookup logic จาก React
- [ ] เริ่มหยุดที่เวลา 0; มี Play/Pause, 1x/2x/4x และ progress bar ที่คลิก/ลาก seek ได้ อิง elapsedMs ไม่ใช่จำนวน event
- [ ] ไม่ข้ามช่วงเงียบ: event ห่าง 10 วินาทีที่ 2x ใช้เวลา playback 5 วินาที; duration จบที่ event สุดท้าย ไม่รวมเวลารอ close
- [ ] Timeline/รายการแสดงทุก event; ระหว่างเล่น JSON แสดง event ล่าสุดที่ผ่านและใช้ seq สูงสุดเมื่อเวลาเท่ากัน
- [ ] คลิก event แล้วหยุด เลื่อน playhead และเลือก JSON ของ event นั้นโดยตรง แม้มีหลาย event เวลาเดียวกัน; seek หยุด playback
- [ ] เล่นถึงท้ายแล้วหยุด ไม่ loop; recording ว่างปิด controls และระยะเวลาเป็นศูนย์ปิด Play/seek แต่ยังเลือกตรวจแต่ละ event ได้
- [ ] ทดสอบ transitions/precedence/เวลาเท่ากันด้วย Vitest แบบ deterministic; smoke controls, speed และ seek บน browser จริง โดยไม่มี Replay หรือ E2E automation
- [ ] ใช้ shadcn-first และอัปเดตคู่มือ Playback ให้แยกจาก Replay ชัดเจน
## Comments

Implemented on `feat/headless-event-recorder`. Seven deterministic playback tests passed; browser smoke exercised timed playback, speed and seek.
