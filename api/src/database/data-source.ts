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

config({ path: path.resolve(__dirname, "../../../.env") });

export const dataSourceOptions: DataSourceOptions = {
    type: "postgres",
    url: process.env.ALVER_DATABASE_URL,
    synchronize: true, // auto-creates tables in dev — swap for migrations before production
    entities: [Meeting, Attendee, Mandate, Poll, Vote, Decision, User],
    logging: process.env.NODE_ENV === "development",
    extra: {
        max: 10,
        min: 2,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
    },
};

export const AppDataSource = new DataSource(dataSourceOptions);
