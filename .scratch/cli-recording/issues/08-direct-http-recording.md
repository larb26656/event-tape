# 08: บันทึก HTTP แบบรับตรงเป็น Recording

**Status:** ready-for-agent

**Spec:** [Separate CLI and Player packages and record HTTP traffic](../spec.md)

**What to build:** เปิด record จาก CLI โดยเลือก HTTP Handler ตรง รับ request จริง ตอบ 204 เมื่อ Recorder รับ event และเปิด Recording ที่สร้างใน Player เดิมได้ พร้อมขอบเขตข้อมูลและ lifecycle ที่ปลอดภัย

**Blocked by:** 07 — แยกแพ็กเกจ CLI และเปิด Player จากการติดตั้งจริง

## Acceptance criteria

- [ ] มี internal Handler interface/registry สำหรับชื่อ schema/defaults, start ด้วย options ตรวจแล้วและ Recorder จาก CLI, stop และ post-start fatal errors; เพิ่มตัวใหม่โดยไม่แก้ Recorder ไม่โหลด external JS/npm plugins
- [ ] CLI เป็นเจ้าของ Recorder/Writer เดิมและปิดหลัง Handler จบ; ตรวจ handler/options/unknown fields ก่อนสร้างไฟล์หรือ listen; ไม่เปลี่ยน timestamp/sequence/elapsed semantics หรือ envelope v1
- [ ] HTTP/1.1 capture รับทุก ordinary path/method โดย default bind 127.0.0.1; ระบุ listen address อื่นได้ ไม่อ้าง support HTTPS listener, HTTP/2, CONNECT หรือ upgrades
- [ ] อ่าน body จบและ Recorder รับ event แล้วตอบ 204 ไม่อ้าง durability และไม่สร้าง response event ของ upstream ที่ไม่มีอยู่; เก็บ method/URL/headers/body และเวลาเริ่มรับใน payload
- [ ] รองรับ JSON/text/binary โดยไม่แปล domain events; encoding ชัดเจนและไม่สูญเสีย bytes ใช้ base64 เมื่อจำเป็น; เก็บ 64 KiB แรกต่อ body ปรับได้ วัดก่อน base64 พร้อม retained bytes และ truncated/incomplete แยกกัน
- [ ] เก็บ prefix ระหว่างอ่าน ไม่ buffer ทั้งก้อน; exact limit ไม่เป็น truncated หากไม่มี bytes เพิ่ม; ทดสอบ multibyte/binary/empty และ aborted body; emit เมื่อ body จบหรือถูกตัด ไม่ patch events และแจ้งข้อจำกัด crash ก่อนจบ
- [ ] ปิดบัง Authorization/Cookie/Set-Cookie แบบ case-insensitive ก่อนเข้า Recorder มี enable/disable และเพิ่ม blacklist จาก defaults ได้ ไม่อ้างปิดบัง secrets ใน URL/body
- [ ] Output เป็น CLI setting ไม่ใช่ preset; default สร้างใต้ working directory ใน .tape ด้วย sortable UTC timestamp ไม่มี colon และ random word ลงท้าย jsonl; explicit path ใช้เป็นไฟล์นั้น สร้าง parent ให้ ไม่ overwrite/append; automatic collision เลือกชื่อใหม่ด้วย exclusive creation เดิม
- [ ] ประกาศ listening address/output เมื่อเริ่มสำเร็จ; รักษา cleanup เมื่อ startup ไม่สำเร็จ; idle timeout เริ่มต้น 30 วินาทีปรับได้ ไม่ใช่ lifetime ของ active stream
- [ ] จำกัด pending writes และ aggregate in-flight capture ไม่เพียงต่อ-body; ไม่มีคิวไม่จำกัดหรือ silent drops; synchronous rejection/asynchronous Writer failure หรือ unsafe overload ทำให้แจ้ง error และ graceful shutdown
- [ ] Ctrl+C หยุดรับงานใหม่ รองานค้าง แล้ว close Recorder ภายในงบรวม 10 วินาทีปรับได้; จัดการ repeated shutdown/races และ deadline expiry ไม่ค้าง idle sockets; abnormal failure/expiry exit ไม่สำเร็จ
- [ ] พิสูจน์ actual installed CLI → real HTTP → valid JSONL → actual Player; ตรวจ output collision/existing-file safety, schema side effects, redaction/truncation, timeout, pending-write failure และ shutdown ด้วย deterministic isolated tests กับ smoke ที่จำเป็น
- [ ] อัปเดต docs/help สำหรับ direct capture, output, privacy, limits และ stop; ไม่เพิ่ม UI ใหม่หรือ SDK core ซ้ำ
