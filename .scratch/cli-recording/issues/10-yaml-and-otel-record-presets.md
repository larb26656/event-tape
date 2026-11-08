# 10: ใช้ YAML Record Preset และ builtin OTel

**Status:** resolved

**Spec:** [Separate CLI and Player packages and record HTTP traffic](../spec.md)

**What to build:** เริ่ม capture/proxy ผ่าน plain YAML ที่ผู้ใช้เขียนเองหรือ builtin otel โดยใช้ HTTP Handler และ session เดิม พร้อม override จาก CLI และยังเรียก Handler โดยตรงได้

**Blocked by:** 09 — ส่งต่อ HTTP แบบ Streaming Proxy พร้อมบันทึกสองทิศทาง

## Acceptance criteria

- [ ] --preset เลือก builtin name ส่วน --preset-file เลือกไฟล์ YAML ใช้ได้อย่างใดอย่างหนึ่ง ไม่เดา name/path ไม่ merge แหล่ง preset; direct Handler selection ยังทำงาน
- [ ] Plain YAML มี handler selector และ options ซึ่งตรวจด้วย schema ของ Handler ที่ลงทะเบียน ไม่มี extends/inheritance, expressions, executable transforms หรือ external Handler loading
- [ ] Resolve explicit CLI > preset > Handler defaults แบบราย option; absent parser defaults ไม่กลบ YAML และ explicit false override ได้; ใช้ validation เดียวกับ direct invocation
- [ ] Unknown selector/fields, malformed YAML, invalid types/mode และ missing upstream แจ้ง field/reason และ exit ก่อนสร้าง Recording/listen/connect upstream; ไม่มี output path ใน preset
- [ ] Builtin otel ใช้ HTTP proxy mode และต้องระบุ upstream เอง ไม่มี default collector destination ไม่อ้าง collector, semantic OTel decoding หรือ OTLP/gRPC support; ใช้ Handler implementation เดิมไม่สร้าง recording pipeline แยก
- [ ] ค่า capture limit, redaction enable/disable/additional blacklist, listen/upstream และ idle timeout จาก preset/CLI มีผลจริงใน traffic/Recording; shutdown deadline ยังคงเป็น session setting
- [ ] Output naming/exclusive creation และ existing view workflows ไม่เปลี่ยน; CLI preset ยังคงใช้ได้เมื่อติดตั้งนอก workspace
- [ ] พิสูจน์ installed CLI ทั้ง user YAML capture และ YAML proxy กับ builtin otel ผ่าน real loopback traffic/fixture collector endpoint แล้วเปิด Recording ใน Player จริง; test precedence/errors ผ่าน observable behaviour ไม่ใช้ mock forwarding echoes
- [ ] อัปเดต usage/help ตัวอย่าง direct capture/proxy, builtin preset, user YAML, selector conflicts, precedence และ privacy/compatibility limits; ตรวจ relevant suite/typecheck/lint/build และ smoke จริงตาม spec

## Answer

Implemented on `integration-cli-recording` in `b7342e2`. An installed CLI handled YAML capture, YAML proxy and builtin OTel traffic against loopback; their Recordings were opened in the actual Player.
