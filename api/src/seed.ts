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

const FACILITATOR_ENAME = process.env.VITE_FACILITATOR_ENAME || "@9dafa031-4118-564c-bfa6-5917ddc8ab88";

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
        title_font: "Nunito",
        locations: [
            {
                id: "loc-1",
                name: "Vrijeschool Amsterdam West",
                address: "Eerste Nassaustraat 5, 1052 BD Amsterdam",
                maps_url: "https://maps.google.com/?q=Eerste Nassaustraat 5, 1052 BD Amsterdam",
                isDefault: true,
            },
            {
                id: "loc-2",
                name: "Thonik",
                address: "Grensstraat 47, 1091 SW Amsterdam",
                maps_url: "https://maps.google.com/?q=Grensstraat%2047%2C%201091%20SW%20Amsterdam",
                isDefault: false,
            },
        ],
    });
    const savedComm = await communityRepo.save(comm);
    console.log(`✅ Community created: ${savedComm.id}`);

    // ── Members ───────────────────────────────────────────────────────────────
    const regularMembers: { first_name: string; last_name: string }[] = [
        { first_name: "Anna",      last_name: "Kenbeek" },
        { first_name: "Anne",      last_name: "Gelderland" },
        { first_name: "Aysegul",   last_name: "Celik" },
        { first_name: "Bethany",   last_name: "Copsey" },
        { first_name: "Christina", last_name: "Drotenko" },
        { first_name: "Ella",      last_name: "Sikken" },
        { first_name: "Gereon",    last_name: "Wahle" },
        { first_name: "Hannah",    last_name: "van Gelderen" },
        { first_name: "Irene",     last_name: "Brok" },
        { first_name: "Irma",      last_name: "van Geffen" },
        { first_name: "Isabelle",  last_name: "van Eijk" },
        { first_name: "Isidore",   last_name: "van Westing" },
        { first_name: "Isis",      last_name: "van der Knaap" },
        { first_name: "Jan",       last_name: "van den Oord" },
        { first_name: "Jaro",      last_name: "Pichel" },
        { first_name: "Josien",    last_name: "Verwoerd" },
        { first_name: "Konrad",    last_name: "Rybka" },
        { first_name: "Laura",     last_name: "van den Brink" },
        { first_name: "Loulou",    last_name: "Kokkedee" },
        { first_name: "Maria",     last_name: "Luttikhuis" },
        { first_name: "Marvin",    last_name: "Oppong" },
        { first_name: "Mories",    last_name: "Römkens" },
        { first_name: "Myrte",     last_name: "Blanken" },
        { first_name: "Nikki",     last_name: "Spee" },
        { first_name: "Nils",      last_name: "Hollestelle" },
        { first_name: "Nina",      last_name: "van Rossem" },
        { first_name: "Pim",       last_name: "Boer" },
        { first_name: "Sanci",     last_name: "Koper" },
        { first_name: "Selma",     last_name: "Beltifa" },
        { first_name: "Sjoerd",    last_name: "Eltink" },
        { first_name: "Suzanne",   last_name: "Bollen" },
        { first_name: "Truus",     last_name: "Weesjes" },
        { first_name: "Yara",      last_name: "Fransen" },
        { first_name: "Yentl",     last_name: "Kuin" },
        { first_name: "Yoshi",     last_name: "Reinders" },
        { first_name: "Yse",       last_name: "Tuynman" },
        { first_name: "Yvo",       last_name: "Snoeker" },
        { first_name: "Robin",     last_name: "Ramael" },
    ];

    const aspirantMembers: { first_name: string; last_name: string }[] = [
        { first_name: "Fietje",       last_name: "Engelhard" },
        { first_name: "Freya & Luca", last_name: "" },
        { first_name: "Janna",        last_name: "Hoogerwerf" },
        { first_name: "Lilian",       last_name: "Kingma" },
        { first_name: "Sam & Koen",   last_name: "" },
        { first_name: "Tim",          last_name: "Strasser" },
    ];

    for (const { first_name, last_name } of regularMembers) {
        const name = last_name ? `${first_name} ${last_name}` : first_name;
        await memberRepo.save(memberRepo.create({
            community_id: savedComm.id,
            name,
            first_name,
            last_name,
            is_aspirant: false,
            is_facilitator: false,
        }));
    }
    for (const { first_name, last_name } of aspirantMembers) {
        const name = last_name ? `${first_name} ${last_name}` : first_name;
        await memberRepo.save(memberRepo.create({
            community_id: savedComm.id,
            name,
            first_name,
            last_name,
            is_aspirant: true,
            is_facilitator: false,
        }));
    }

    // Facilitator as community member
    await memberRepo.save(memberRepo.create({
        community_id: savedComm.id,
        name: "Sergei Zhilin",
        first_name: "Sergei",
        last_name: "Zhilin",
        ename: FACILITATOR_ENAME,
        is_facilitator: true,
        is_aspirant: false,
    }));

    // Dev tester member — used with /api/auth/dev-login
    await memberRepo.save(memberRepo.create({
        community_id: savedComm.id,
        name: "Tester van Vergaderen",
        first_name: "Tester",
        last_name: "van Vergaderen",
        ename: "tester@dewoonwolk",
        is_aspirant: false,
        is_facilitator: false,
    }));

    console.log(`✅ ${regularMembers.length} members + ${aspirantMembers.length} aspirants + 1 facilitator + 1 dev tester seeded`);

    // ── Archived meeting: ALV 2026-03-23 ─────────────────────────────────────
    const archivedMeeting = await meetingRepo.save(meetingRepo.create({
        community_id: savedComm.id,
        name: "ALV 2026-03-23",
        date: "2026-03-23",
        time: "19:30",
        location: "Vrijeschool Amsterdam West",
        agenda_text: `1. Opening en vaststelling agenda\n2. Notulen vorige ALV\n3. Financieel jaarverslag 2025 — ter informatie\n4. Besluit: verhoging maandelijkse bijdrage\n5. Besluit: aanstelling nieuwe penningmeester\n6. Rondvraag en sluiting`,
        status: "archived",
        facilitator_name: "Sergei Zhilin",
    }));

    const archivedAttendees = [
        { name: "Joost van den Berg",    status: "checked_in" as const },
        { name: "Lies de Boer",          status: "checked_in" as const },
        { name: "Mehmet Yilmaz",         status: "checked_in" as const },
        { name: "Nadia El Amrani",       status: "checked_in" as const },
        { name: "Pim Visser",            status: "expected" as const },
        { name: "Roel Vermeer",          status: "checked_in" as const },
        { name: "Sara Bakker",           status: "checked_in" as const },
        { name: "Tester van Vergaderen", status: "checked_in" as const },
        { name: "Thomas Kuiper",         status: "expected" as const },
    ];
    for (const { name, status } of archivedAttendees) {
        await attendeeRepo.save(attendeeRepo.create({
            meeting_id: archivedMeeting.id,
            attendee_name: name,
            is_aspirant: false,
            status,
            checked_in_at: status === "checked_in" ? new Date("2026-03-23T19:35:00+01:00") : null,
            method: "app",
        }));
    }

    await mandateRepo.save(mandateRepo.create({
        meeting_id: archivedMeeting.id,
        granter_name: "Karin",
        proxy_name: "Mehmet",
        scope_note: "alleen besluitpunten",
        status: "active",
        granted_at: new Date("2026-03-23T18:00:00Z"),
    }));
    await mandateRepo.save(mandateRepo.create({
        meeting_id: archivedMeeting.id,
        granter_name: "Robin",
        proxy_name: "Lies",
        scope_note: "voor alle agendapunten",
        status: "active",
        granted_at: new Date("2026-03-23T09:00:00Z"),
    }));

    await pollRepo.save(pollRepo.create({
        meeting_id: archivedMeeting.id,
        motion_text: "De maandelijkse bijdrage wordt per 1 januari 2026 verhoogd van €50 naar €65.",
        vote_options: [
            { id: "voor",       label: "Voor" },
            { id: "tegen",      label: "Tegen" },
            { id: "onthouding", label: "Onthouding" },
        ],
        status: "prepared",
    }));
    await pollRepo.save(pollRepo.create({
        meeting_id: archivedMeeting.id,
        motion_text: "Fatima El Mansouri wordt benoemd als penningmeester voor de periode 2026–2028.",
        vote_options: [
            { id: "ja",  label: "Ja" },
            { id: "nee", label: "Nee" },
        ],
        status: "prepared",
    }));
    console.log(`✅ Archived meeting seeded: ${archivedMeeting.id}`);

    // ── Upcoming meetings ─────────────────────────────────────────────────────
    await meetingRepo.save(meetingRepo.create({
        community_id: savedComm.id,
        name: "ALV 11-04-2026",
        date: "2026-04-11",
        time: "11:11",
        location: "Thonik",
        agenda_text: "",
        status: "draft",
        facilitator_name: "Sergei Zhilin",
    }));

    // ── Active meeting for dev/testing ────────────────────────────────────────
    const TODAY = new Date().toISOString().slice(0, 10);
    const activeMeeting = await meetingRepo.save(meetingRepo.create({
        community_id: savedComm.id,
        name: `ALV ${TODAY}`,
        date: TODAY,
        time: "19:30",
        location: "Vrijeschool Amsterdam West",
        agenda_text: `1. Opening en vaststelling agenda\n2. Notulen vorige ALV\n3. Financieel jaarverslag 2025 — ter informatie\n4. Besluit: verhoging maandelijkse bijdrage\n5. Besluit: aanstelling nieuwe penningmeester\n6. Rondvraag en sluiting`,
        status: "open",
        facilitator_name: "Sergei Zhilin",
    }));
    console.log(`✅ Active meeting created: ${activeMeeting.id}`);

    console.log(`\n🎉 Seed complete!`);
    console.log(`   Community: De Woonwolk (${savedComm.id})`);
    console.log(`   Members: ${regularMembers.length} regular + ${aspirantMembers.length} aspirants + 1 facilitator + 1 tester`);
    console.log(`   Active meeting: ${activeMeeting.id}`);
    console.log(`   Open in browser: http://localhost:5174/dewoonwolk/meeting/${activeMeeting.id}/facilitate`);

    await AppDataSource.destroy();
}

seed().catch((e) => { console.error("❌ Seed failed:", e); process.exit(1); });
