import "reflect-metadata";
import path from "path";
import { config } from "dotenv";
import { AppDataSource } from "./database/data-source";
import { Meeting } from "./database/entities/Meeting";
import { Attendee } from "./database/entities/Attendee";
import { Mandate } from "./database/entities/Mandate";
import { Poll } from "./database/entities/Poll";

config({ path: path.resolve(__dirname, "../../.env") });

async function seed() {
    await AppDataSource.initialize();
    console.log("🌱 Seeding database...");

    const meetingRepo = AppDataSource.getRepository(Meeting);
    const attendeeRepo = AppDataSource.getRepository(Attendee);
    const mandateRepo = AppDataSource.getRepository(Mandate);
    const pollRepo = AppDataSource.getRepository(Poll);

    // Clear existing seed data (idempotent)
    await AppDataSource.query(`DELETE FROM votes`);
    await AppDataSource.query(`DELETE FROM decisions`);
    await AppDataSource.query(`DELETE FROM polls`);
    await AppDataSource.query(`DELETE FROM mandates`);
    await AppDataSource.query(`DELETE FROM attendees`);
    await AppDataSource.query(`DELETE FROM meetings`);

    // ── Meeting ───────────────────────────────────────────────────────────────
    const meeting = meetingRepo.create({
        name: "ALV De Woonwolk — februari 2026",
        date: "2026-02-14",
        time: "19:30",
        location: "Buurtcentrum GWL",
        agenda_text: `1. Opening en vaststelling agenda\n2. Notulen vorige ALV\n3. Financieel jaarverslag 2025 — ter informatie\n4. Besluit: verhoging maandelijkse bijdrage\n5. Besluit: aanstelling nieuwe penningmeester\n6. Rondvraag en sluiting`,
        status: "open",
        facilitator_name: "Facilitator",
    });
    const saved = await meetingRepo.save(meeting);
    const mid = saved.id;
    console.log(`✅ Meeting created: ${mid}`);

    // ── Attendees — pre-registered ────────────────────────────────────────────
    const preRegistered = ["Sara", "Mehmet", "Lies", "Joost", "Roel", "Nadia", "Thomas", "Pim"];
    const checkedIn = ["Sara", "Mehmet", "Lies", "Joost", "Roel", "Nadia"];
    const checkInTimes: Record<string, string> = {
        Sara: "19:28", Mehmet: "19:31", Lies: "19:33",
        Joost: "19:35", Roel: "19:36", Nadia: "19:37",
    };

    for (const name of preRegistered) {
        const isIn = checkedIn.includes(name);
        const timeStr = checkInTimes[name];
        const checkedInAt = isIn && timeStr
            ? new Date(`2026-02-14T${timeStr}:00+01:00`)
            : null;

        await attendeeRepo.save(attendeeRepo.create({
            meeting_id: mid,
            attendee_name: name,
            status: isIn ? "checked_in" : "expected",
            pre_registered_at: new Date("2026-02-10T10:00:00Z"),
            checked_in_at: checkedInAt,
            method: "app",
        }));
    }
    console.log(`✅ ${preRegistered.length} attendees seeded (${checkedIn.length} checked in)`);

    // ── Mandates ──────────────────────────────────────────────────────────────
    await mandateRepo.save(mandateRepo.create({
        meeting_id: mid,
        granter_name: "Robin",
        proxy_name: "Lies",
        scope_note: "voor alle agendapunten",
        status: "active",
        granted_at: new Date("2026-02-13T18:00:00Z"),
    }));
    await mandateRepo.save(mandateRepo.create({
        meeting_id: mid,
        granter_name: "Karin",
        proxy_name: "Mehmet",
        scope_note: "alleen besluitpunten",
        status: "active",
        granted_at: new Date("2026-02-14T09:00:00Z"),
    }));
    console.log("✅ 2 mandates seeded");

    // ── Polls ─────────────────────────────────────────────────────────────────
    await pollRepo.save(pollRepo.create({
        meeting_id: mid,
        motion_text: "De maandelijkse bijdrage wordt per 1 januari 2026 verhoogd van €50 naar €65.",
        vote_options: [
            { id: "voor", label: "Voor" },
            { id: "tegen", label: "Tegen" },
            { id: "onthouding", label: "Onthouding" },
        ],
        status: "prepared",
    }));
    await pollRepo.save(pollRepo.create({
        meeting_id: mid,
        motion_text: "Fatima El Mansouri wordt benoemd als penningmeester voor de periode 2026–2028.",
        vote_options: [
            { id: "ja", label: "Ja" },
            { id: "nee", label: "Nee" },
        ],
        status: "prepared",
    }));
    console.log("✅ 2 polls seeded");

    console.log(`\n🎉 Seed complete! Meeting ID: ${mid}`);
    console.log(`   Open in browser: http://localhost:5174/meeting/${mid}/facilitate`);

    await AppDataSource.destroy();
}

seed().catch((e) => { console.error("❌ Seed failed:", e); process.exit(1); });
