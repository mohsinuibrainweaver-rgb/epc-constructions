// The six mesh gradients of the statistics cards (the colours live in src/index.css). A card is given a gradient by its position in its group,
// so neighbours always differ, the same place always gets the same gradient, and a group of more than six starts again from the first.

export const MESH = ['amethyst', 'arctic', 'champagne', 'rose', 'sage', 'periwinkle'] as const
export type MeshName = (typeof MESH)[number]

/** Classes for the surface of the statistics card at this position: the gradient, its hairline border and its text colours. */
export const meshCard = (index: number): string => `mesh-card mesh-gradient mesh-${MESH[((index % MESH.length) + MESH.length) % MESH.length]}`

/** The icon tile inside such a card. */
export const MESH_TILE = 'mesh-tile'
