import "reflect-metadata";
import path from "path";
import fs from "fs";
import { config } from "dotenv";
import { AppDataSource } from "./database/data-source";
import { Community } from "./database/entities/Community";
import { Member } from "./database/entities/Member";
import { Meeting } from "./database/entities/Meeting";
import { Attendee } from "./database/entities/Attendee";
import { Mandate } from "./database/entities/Mandate";
import { Poll } from "./database/entities/Poll";

config({ path: path.resolve(__dirname, "../../.env") });

const FACILITATOR_ENAME = process.env.VITE_FACILITATOR_ENAME || "facilitator@dewoonwolk";

const logoPath = path.resolve(__dirname, "test_logo.svg");
const LOGO_URL = fs.existsSync(logoPath)
    ? `data:image/svg+xml;base64,${fs.readFileSync(logoPath).toString("base64")}`
    : null;

async function seed() {
    await AppDataSource.initialize();
    console.log("🌱 Seeding database...");

    const communityRepo = AppDataSource.getRepository(Community);
    const memberRepo    = AppDataSource.getRepository(Member);
    const meetingRepo   = AppDataSource.getRepository(Meeting);
    const attendeeRepo  = AppDataSource.getRepository(Attendee);
    const mandateRepo   = AppDataSource.getRepository(Mandate);
    const pollRepo      = AppDataSource.getRepository(Poll);

    // Clear in dependency order
    await AppDataSource.query(`DELETE FROM votes`);
    await AppDataSource.query(`DELETE FROM decisions`);
    await AppDataSource.query(`DELETE FROM polls`);
    await AppDataSource.query(`DELETE FROM mandates`);
    await AppDataSource.query(`DELETE FROM attendees`);
    await AppDataSource.query(`DELETE FROM meetings`);
    await AppDataSource.query(`DELETE FROM members`);
    await AppDataSource.query(`DELETE FROM communities`);

    // ── Community ─────────────────────────────────────────────────────────────
    const comm = communityRepo.create({
        name: "De Woonwolk",
        slug: "dewoonwolk",
        facilitator_ename: FACILITATOR_ENAME,
        logo_url: LOGO_URL,
        primary_color: "#2D7A4A",
        title_font: "Playfair Display",
        locations: [
            {
                id: "loc-1",
                name: "Buurtcentrum GWL Terrein",
                address: "Kostverlorenkade 7, Amsterdam",
                maps_url: "https://maps.google.com/?q=Kostverlorenkade+7+Amsterdam",
                isDefault: true,
            },
        ],
    });
    const savedComm = await communityRepo.save(comm);
    console.log(`✅ Community created: ${savedComm.id}`);

    // ── Members ───────────────────────────────────────────────────────────────
    const regularMembers = [
        // pre-registered in this meeting
        { first_name: "Sara",    last_name: "Bakker" },
        { first_name: "Mehmet",  last_name: "Yilmaz" },
        { first_name: "Lies",    last_name: "de Boer" },
        { first_name: "Joost",   last_name: "van den Berg" },
        { first_name: "Roel",    last_name: "Vermeer" },
        { first_name: "Nadia",   last_name: "El Amrani" },
        { first_name: "Thomas",  last_name: "Kuiper" },
        { first_name: "Pim",     last_name: "Visser" },
        // mandate granters
        { first_name: "Robin",   last_name: "Smit" },
        { first_name: "Karin",   last_name: "Dijkstra" },
        // 10 additional members
        { first_name: "Fatima",  last_name: "El Mansouri" },
        { first_name: "Pieter",  last_name: "Janssen" },
        { first_name: "Anna",    last_name: "van Dijk" },
        { first_name: "Kevin",   last_name: "Brouwer" },
        { first_name: "Inge",    last_name: "Meijer" },
        { first_name: "Marco",   last_name: "Hendriks" },
        { first_name: "Yasmine", last_name: "Okafor" },
        { first_name: "Hans",    last_name: "de Graaf" },
        { first_name: "Sofie",   last_name: "Peeters" },
        { first_name: "David",   last_name: "Cohen" },
    ];
    const aspirantMembers = [
        { first_name: "Lisa",  last_name: "Verwey" },
        { first_name: "Omar",  last_name: "Hassan" },
        { first_name: "Emma",  last_name: "van Loon" },
    ];

    const memberMap: Record<string, Member> = {};

    for (const { first_name, last_name } of regularMembers) {
        const name = `${first_name} ${last_name}`;
        const m = await memberRepo.save(memberRepo.create({
            community_id: savedComm.id,
            name,
            first_name,
            last_name,
            is_aspirant: false,
        }));
        memberMap[first_name] = m;
    }
    for (const { first_name, last_name } of aspirantMembers) {
        const name = `${first_name} ${last_name}`;
        const m = await memberRepo.save(memberRepo.create({
            community_id: savedComm.id,
            name,
            first_name,
            last_name,
            is_aspirant: true,
        }));
        memberMap[first_name] = m;
    }

    // Dev tester member — used with /api/auth/dev-login
    await memberRepo.save(memberRepo.create({
        community_id: savedComm.id,
        name: "Tester van Vergaderen",
        first_name: "Tester",
        last_name: "van Vergaderen",
        ename: "tester@dewoonwolk",
        is_aspirant: false,
    }));

    // Facilitator as community member (hidden flag)
    await memberRepo.save(memberRepo.create({
        community_id: savedComm.id,
        name: "Sergei Zhilin",
        first_name: "Sergei",
        last_name: "Zhilin",
        ename: FACILITATOR_ENAME,
        is_facilitator: true,
        is_aspirant: false,
    }));

    console.log(`✅ ${regularMembers.length} members + ${aspirantMembers.length} aspirants + 1 facilitator seeded`);

    // ── Active meeting ────────────────────────────────────────────────────────
    const TODAY = new Date().toISOString().slice(0, 10);
    const meeting = meetingRepo.create({
        community_id: savedComm.id,
        name: `ALV ${TODAY}`,
        date: TODAY,
        time: "19:30",
        location: "Buurtcentrum GWL Terrein",
        agenda_text: `1. Opening en vaststelling agenda\n2. Notulen vorige ALV\n3. Financieel jaarverslag 2025 — ter informatie\n4. Besluit: verhoging maandelijkse bijdrage\n5. Besluit: aanstelling nieuwe penningmeester\n6. Rondvraag en sluiting`,
        status: "in_session",
        facilitator_name: "Sergei Zhilin",
    });
    const saved = await meetingRepo.save(meeting);
    const mid = saved.id;
    console.log(`✅ Meeting created: ${mid}`);

    // ── Attendees ─────────────────────────────────────────────────────────────
    const preRegistered = ["Sara", "Mehmet", "Lies", "Joost", "Roel", "Nadia", "Thomas", "Pim"];
    const checkedIn     = ["Sara", "Mehmet", "Lies", "Joost", "Roel", "Nadia"];
    const checkInTimes: Record<string, string> = {
        Sara: "19:28", Mehmet: "19:31", Lies: "19:33",
        Joost: "19:35", Roel: "19:36", Nadia: "19:37",
    };

    for (const firstName of preRegistered) {
        const isIn = checkedIn.includes(firstName);
        const timeStr = checkInTimes[firstName];
        const checkedInAt = isIn && timeStr
            ? new Date(`2026-02-14T${timeStr}:00+01:00`)
            : null;
        const member = memberMap[firstName];

        await attendeeRepo.save(attendeeRepo.create({
            meeting_id: mid,
            member_id: member?.id,
            attendee_name: member?.name ?? firstName,
            is_aspirant: member?.is_aspirant ?? false,
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

    // ── Archived meetings ─────────────────────────────────────────────────────
    await meetingRepo.save(meetingRepo.create({
        community_id: savedComm.id,
        name: "ALV 20-11-2025",
        date: "2025-11-20",
        time: "19:30",
        location: "Buurtcentrum GWL Terrein",
        agenda_text: `1. Opening\n2. Notulen ALV mei 2025\n3. Jaarplan 2026\n4. Rondvraag en sluiting`,
        status: "archived",
        facilitator_name: "Sergei Zhilin",
    }));
    await meetingRepo.save(meetingRepo.create({
        community_id: savedComm.id,
        name: "ALV 08-05-2025",
        date: "2025-05-08",
        time: "19:30",
        location: "Buurtcentrum GWL Terrein",
        agenda_text: `1. Opening\n2. Jaarrekening 2024\n3. Besluit: dakisolatie project\n4. Bestuursverkiezing\n5. Rondvraag en sluiting`,
        status: "archived",
        facilitator_name: "Sergei Zhilin",
    }));

    // ── Future meetings ───────────────────────────────────────────────────────
    await meetingRepo.save(meetingRepo.create({
        community_id: savedComm.id,
        name: "ALV 14-05-2026",
        date: "2026-05-14",
        time: "19:30",
        location: "Buurtcentrum GWL Terrein",
        agenda_text: `1. Opening\n2. Notulen ALV februari 2026\n3. Zomerprogramma\n4. Rondvraag en sluiting`,
        status: "draft",
        facilitator_name: "Sergei Zhilin",
    }));
    await meetingRepo.save(meetingRepo.create({
        community_id: savedComm.id,
        name: "ALV 10-09-2026",
        date: "2026-09-10",
        time: "19:30",
        location: "Buurtcentrum GWL Terrein",
        agenda_text: `1. Opening\n2. Notulen ALV mei 2026\n3. Begroting 2027\n4. Rondvraag en sluiting`,
        status: "draft",
        facilitator_name: "Sergei Zhilin",
    }));
    console.log("✅ 4 additional meetings seeded");

    console.log(`\n🎉 Seed complete!`);
    console.log(`   Community: De Woonwolk (${savedComm.id})`);
    console.log(`   Meeting ID: ${mid}`);
    console.log(`   Members: ${regularMembers.length} regular + ${aspirantMembers.length} aspirants + 1 facilitator`);
    console.log(`   Open in browser: http://localhost:5174/meeting/${mid}/facilitate`);

    await AppDataSource.destroy();
}

seed().catch((e) => { console.error("❌ Seed failed:", e); process.exit(1); });
