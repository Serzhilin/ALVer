export const ONTOLOGIES = {
    User:      '550e8400-e29b-41d4-a716-446655440000',
    Community: '550e8400-e29b-41d4-a716-446655440003',
    Meeting:   '880e8400-e29b-41d4-a716-446655440099',
    Poll:      '660e8400-e29b-41d4-a716-446655440100',
    Vote:      '660e8400-e29b-41d4-a716-446655440101',
} as const;

export type OntologyId = typeof ONTOLOGIES[keyof typeof ONTOLOGIES];
