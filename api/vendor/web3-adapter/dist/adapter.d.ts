export type FieldMapping = {
    sourceField: string;
    targetField: string;
    transform?: (value: unknown) => unknown;
};
export declare class Web3Adapter {
    private mappings;
    constructor();
    registerMapping(platform: string, mappings: FieldMapping[]): void;
    toUniversal(platform: string, data: Record<string, unknown>): Record<string, unknown>;
    fromUniversal(platform: string, data: Record<string, unknown>): Record<string, unknown>;
}
