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
    const regularMembers: { app_first_name: string; app_last_name: string }[] = [
        { app_first_name: "Anna",      app_last_name: "Kenbeek" },
        { app_first_name: "Anne",      app_last_name: "Gelderland" },
        { app_first_name: "Aysegul",   app_last_name: "Celik" },
        { app_first_name: "Bethany",   app_last_name: "Copsey" },
        { app_first_name: "Christina", app_last_name: "Drotenko" },
        { app_first_name: "Ella",      app_last_name: "Sikken" },
        { app_first_name: "Gereon",    app_last_name: "Wahle" },
        { app_first_name: "Hannah",    app_last_name: "van Gelderen" },
        { app_first_name: "Irene",     app_last_name: "Brok" },
        { app_first_name: "Irma",      app_last_name: "van Geffen" },
        { app_first_name: "Isabelle",  app_last_name: "van Eijk" },
        { app_first_name: "Isidore",   app_last_name: "van Westing" },
        { app_first_name: "Isis",      app_last_name: "van der Knaap" },
        { app_first_name: "Jan",       app_last_name: "van den Oord" },
        { app_first_name: "Jaro",      app_last_name: "Pichel" },
        { app_first_name: "Josien",    app_last_name: "Verwoerd" },
        { app_first_name: "Konrad",    app_last_name: "Rybka" },
        { app_first_name: "Laura",     app_last_name: "van den Brink" },
        { app_first_name: "Loulou",    app_last_name: "Kokkedee" },
        { app_first_name: "Maria",     app_last_name: "Luttikhuis" },
        { app_first_name: "Marvin",    app_last_name: "Oppong" },
        { app_first_name: "Mories",    app_last_name: "Römkens" },
        { app_first_name: "Myrte",     app_last_name: "Blanken" },
        { app_first_name: "Nikki",     app_last_name: "Spee" },
        { app_first_name: "Nils",      app_last_name: "Hollestelle" },
        { app_first_name: "Nina",      app_last_name: "van Rossem" },
        { app_first_name: "Pim",       app_last_name: "Boer" },
        { app_first_name: "Sanci",     app_last_name: "Koper" },
        { app_first_name: "Selma",     app_last_name: "Beltifa" },
        { app_first_name: "Sjoerd",    app_last_name: "Eltink" },
        { app_first_name: "Suzanne",   app_last_name: "Bollen" },
        { app_first_name: "Truus",     app_last_name: "Weesjes" },
        { app_first_name: "Yara",      app_last_name: "Fransen" },
        { app_first_name: "Yentl",     app_last_name: "Kuin" },
        { app_first_name: "Yoshi",     app_last_name: "Reinders" },
        { app_first_name: "Yse",       app_last_name: "Tuynman" },
        { app_first_name: "Yvo",       app_last_name: "Snoeker" },
        { app_first_name: "Robin",     app_last_name: "Ramael" },
    ];

    const aspirantMembers: { app_first_name: string; app_last_name: string }[] = [
        { app_first_name: "Fietje",       app_last_name: "Engelhard" },
        { app_first_name: "Freya & Luca", app_last_name: "" },
        { app_first_name: "Janna",        app_last_name: "Hoogerwerf" },
        { app_first_name: "Lilian",       app_last_name: "Kingma" },
        { app_first_name: "Sam & Koen",   app_last_name: "" },
        { app_first_name: "Tim",          app_last_name: "Strasser" },
    ];

    for (const { app_first_name, app_last_name } of regularMembers) {
        await memberRepo.save(memberRepo.create({
            community_id: savedComm.id,
            app_first_name,
            app_last_name,
            is_aspirant: false,
            is_facilitator: false,
        }));
    }
    for (const { app_first_name, app_last_name } of aspirantMembers) {
        await memberRepo.save(memberRepo.create({
            community_id: savedComm.id,
            app_first_name,
            app_last_name,
            is_aspirant: true,
            is_facilitator: false,
        }));
    }

    // Facilitator as community member
    await memberRepo.save(memberRepo.create({
        community_id: savedComm.id,
        app_first_name: "Sergei",
        app_last_name: "Zhilin",
        ename: FACILITATOR_ENAME,
        is_facilitator: true,
        is_aspirant: false,
    }));

    // Dev tester member — used with /api/auth/dev-login
    await memberRepo.save(memberRepo.create({
        community_id: savedComm.id,
        app_first_name: "Tester",
        app_last_name: "van Vergaderen",
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
