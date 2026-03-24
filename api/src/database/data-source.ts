import "reflect-metadata";
import path from "path";
import { config } from "dotenv";
import { DataSource, type DataSourceOptions } from "typeorm";
import { Meeting } from "./entities/Meeting";
import { Attendee } from "./entities/Attendee";
import { Mandate } from "./entities/Mandate";
import { Poll } from "./entities/Poll";
import { Vote } from "./entities/Vote";
import { Decision } from "./entities/Decision";
import { User } from "./entities/User";
import { Community } from "./entities/Community";
import { Member } from "./entities/Member";

config({ path: path.resolve(__dirname, "../../../.env") });

export const dataSourceOptions: DataSourceOptions = {
    type: "postgres",
    url: process.env.ALVER_DATABASE_URL,
    synchronize: process.env.NODE_ENV !== "production", // never auto-sync in production
    entities: [Meeting, Attendee, Mandate, Poll, Vote, Decision, User, Community, Member],
    logging: process.env.NODE_ENV === "development",
    extra: {
        max: 10,
        min: 2,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
    },
};

export const AppDataSource = new DataSource(dataSourceOptions);
