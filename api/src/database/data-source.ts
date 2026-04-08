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
import { AlverSubscriber } from "../web3adapter/subscriber";

config({ path: path.resolve(__dirname, "../../../.env") });

const isProduction = process.env.NODE_ENV === "production";

export const dataSourceOptions: DataSourceOptions = {
    type: "postgres",
    url: process.env.ALVER_DATABASE_URL,
    // synchronize only in dev; migrations handle schema changes in production
    synchronize: !isProduction,
    entities: [Meeting, Attendee, Mandate, Poll, Vote, Decision, User, Community, Member],
    subscribers: [AlverSubscriber],
    migrations: [path.join(__dirname, "migrations", __filename.endsWith(".ts") ? "*.ts" : "*.js")],
    logging: false,
    extra: {
        max: 10,
        min: 2,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
    },
};

export const AppDataSource = new DataSource(dataSourceOptions);
