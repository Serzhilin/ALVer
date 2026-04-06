"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Web3Adapter = void 0;
class Web3Adapter {
    constructor() {
        this.mappings = new Map();
    }
    registerMapping(platform, mappings) {
        this.mappings.set(platform, mappings);
    }
    toUniversal(platform, data) {
        const mappings = this.mappings.get(platform);
        if (!mappings) {
            throw new Error(`No mappings found for platform: ${platform}`);
        }
        const result = {};
        for (const mapping of mappings) {
            if (data[mapping.sourceField] !== undefined) {
                const value = mapping.transform
                    ? mapping.transform(data[mapping.sourceField])
                    : data[mapping.sourceField];
                result[mapping.targetField] = value;
            }
        }
        return result;
    }
    fromUniversal(platform, data) {
        const mappings = this.mappings.get(platform);
        if (!mappings) {
            throw new Error(`No mappings found for platform: ${platform}`);
        }
        const result = {};
        for (const mapping of mappings) {
            if (data[mapping.targetField] !== undefined) {
                const value = mapping.transform
                    ? mapping.transform(data[mapping.targetField])
                    : data[mapping.targetField];
                result[mapping.sourceField] = value;
            }
        }
        return result;
    }
}
exports.Web3Adapter = Web3Adapter;
