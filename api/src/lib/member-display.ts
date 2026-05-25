// api/src/lib/member-display.ts

interface NameFields {
    app_first_name?: string | null;
    app_last_name?: string | null;
}

/** Full name from paperwork fields: "Truus Weesjes" */
export function appDisplayName(member: NameFields): string {
    const first = member.app_first_name?.trim() ?? "";
    const last = member.app_last_name?.trim() ?? "";
    if (first && last) return `${first} ${last}`;
    return first || last || "?";
}

/** Compact name: "Truus W." — use in lists, attendee rows */
export function appDisplayNameShort(member: NameFields): string {
    const first = member.app_first_name?.trim() ?? "";
    const lastInitial = member.app_last_name?.trim()?.[0] ?? "";
    if (first && lastInitial) return `${first} ${lastInitial}.`;
    return appDisplayName(member);
}
