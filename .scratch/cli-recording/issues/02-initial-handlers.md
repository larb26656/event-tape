# ช่องทางรับข้อมูลและ protocol ชุดแรก

Labels: wayfinder:grilling
Type: grilling
Status: claimed

## Question

การรับตรงและ proxy ต้องรองรับ protocol ใดบ้างในการส่งมอบครั้งแรก และแต่ละช่องทางมีสถานการณ์ใช้งานตัวแทนอะไร? แยกความต้องการ HTTP, WebSocket และช่องทางอนาคต ไม่ถือว่าตัวอย่างทั้งหมดเป็นข้อผูกมัด

## Comments

- ผู้ใช้ระบุให้ช่วงแรก focus HTTP request; แหล่งข้อมูลอื่นยังเป็นทิศทางการขยาย ไม่ใช่รายการที่ต้องส่งมอบช่วงแรก
- ผู้ใช้ยืนยันแนวทาง HTTP request/response capture ก่อนสำหรับตัวอย่าง OTel ไม่กำหนดให้แตก payload เป็น event ตามความหมาย OTel; ขอบเขต Record Preset และค่าที่ผู้ใช้เขียนเองติดตามใน [รูปแบบ declarative Record Preset และลำดับการตั้งค่า](06-record-presets.md)
- ผู้ใช้ยืนยันขารับ HTTP/1.1 สำหรับ local/dev; proxy ส่งต่อ upstream HTTP/HTTPS ได้ แต่ยังไม่ทำขารับ HTTPS, HTTP/2, WebSocket หรือ HTTPS interception ในชุดแรก
- HTTP handler รับทุก path และ method ไม่บังคับ `/record`; proxy รักษา method, path และ query เมื่อส่งต่อ upstream ที่กำหนด แอปชี้มาที่ local endpoint โดยตรง ไม่ใช่การดัก HTTPS
