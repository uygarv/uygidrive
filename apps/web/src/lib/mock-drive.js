const preview = {
  coast:
    "https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=1200&q=82",
  studio:
    "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=82",
  landscape:
    "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1200&q=82",
  portrait:
    "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=1200&q=82",
};

const rootItems = [
  { id: "fil_mock_coast", parentId: null, kind: "file", name: "coastal notes.jpeg", sizeBytes: 182_400, contentType: "image/jpeg", createdAt: "2026-08-15T10:18:00.000Z", previewUrl: preview.coast },
  { id: "fil_mock_studio", parentId: null, kind: "file", name: "studio plans.jpg", sizeBytes: 220_160, contentType: "image/jpeg", createdAt: "2026-08-14T15:42:00.000Z", previewUrl: preview.studio },
  { id: "fil_mock_recording", parentId: null, kind: "file", name: "Screen Recording 2025-02-23 at 21.24.51.mov", sizeBytes: 17_825_792, contentType: "video/quicktime", createdAt: "2026-08-13T09:31:00.000Z" },
  { id: "fld_mock_inspiration", parentId: null, kind: "folder", name: "Inspiration", sizeBytes: 0, contentType: null, createdAt: "2026-08-12T11:00:00.000Z" },
  { id: "fil_mock_audio", parentId: null, kind: "file", name: "voice memo.m4a", sizeBytes: 3_248_128, contentType: "audio/mp4", createdAt: "2026-08-11T08:00:00.000Z" },
  { id: "fil_mock_brief", parentId: null, kind: "file", name: "project brief.pdf", sizeBytes: 934_912, contentType: "application/pdf", createdAt: "2026-08-10T13:24:00.000Z" },
];

const inspirationItems = [
  { id: "fil_mock_landscape", parentId: "fld_mock_inspiration", kind: "file", name: "weekend landscape.jpg", sizeBytes: 1_248_190, contentType: "image/jpeg", createdAt: "2026-08-09T12:10:00.000Z", previewUrl: preview.landscape },
  { id: "fil_mock_portrait", parentId: "fld_mock_inspiration", kind: "file", name: "portrait reference.jpg", sizeBytes: 894_311, contentType: "image/jpeg", createdAt: "2026-08-08T17:30:00.000Z", previewUrl: preview.portrait },
];

const storage = {
  usedBytes: 24_358_912,
  reservedBytes: 0,
  limitBytes: 2 * 1024 * 1024 * 1024,
  usedDisplay: "23.2 MB",
  limitDisplay: "2 GB",
  percentUsed: 1,
  isUnlimited: false,
  limitLabel: "2 GB",
};

export function mockDriveList({ parentId = null, search = "", sort = "date:new-first" } = {}) {
  const items = parentId === "fld_mock_inspiration" ? inspirationItems : rootItems;
  const query = search.trim().toLocaleLowerCase();
  const filtered = query ? items.filter((item) => item.name.toLocaleLowerCase().includes(query)) : [...items];
  const direction = sort === "date:old-first" ? 1 : -1;
  filtered.sort((left, right) => direction * (new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()));
  return {
    items: filtered,
    nextCursor: null,
    breadcrumbs: parentId === "fld_mock_inspiration" ? rootItems.filter((item) => item.id === parentId) : [],
    storage,
  };
}

export const mockSession = {
  user: { uid: "mock-user", email: "hello@uygidrive.test" },
  storage,
};
