/* Public surface of `domain/launches`. Everything another module may use is named here;
 * the files behind it are internal. */

export { LAUNCH_ID_PATTERN, commitmentId, idMatches, launchIdFor, metadataOf, slugFor, termsOf } from "./announcement";
export type { LaunchCommitment } from "./announcement";
export { FALLBACK_TIP, phaseTone, place, resolve, specFor } from "./catalogue";
export type { Launch, LaunchPhase, LaunchSpec, Placement } from "./catalogue";
export { PLATFORM_CERT_KEY, REGISTRATION_SATS, TEST_CERT_KEY, TEST_CERT_SECRET, admissionBytes, admitted, certificateMessage, registrationCommitment, registrationFault, signCertificate } from "./certificate";
export type { PaidOutput } from "./certificate";
export { ACCENTS, NO_LINKS, NO_STORY, commitmentFor, draftTerms, isReady, validate } from "./draft";
export type { DraftFaults, DraftField, LaunchDraft } from "./draft";
export { EXTRAS_WIRE_BUDGET, LINK_KINDS, LINK_RULE, MAX_LINK_LENGTH, MAX_STORY_LENGTH, STORY_PARTS, extrasOf, linkFor, publicExtras, storyFor } from "./extras";
export type { LaunchLinks, LaunchStory, LinkKind, StoryPart, TypedExtras } from "./extras";
export { DEMO_SYMBOL, FEATURED_LAUNCH_IDS, FEATURE_RULE, PLATFORM_IDENTITY, featuredLaunch, isFeatured } from "./featured";
export type { FeatureRule } from "./featured";
export { TERMINAL_HALVING, halvingPosition } from "./halvings";
export type { HalvingPosition } from "./halvings";
export { MAX_IMAGE_LENGTH, PLATFORM_IMAGES, artFor, imageFor, imageMatches } from "./image";
export type { ArtSource, TokenArt } from "./image";
export { paidFor, registrationPayment } from "./registration";
export type { Registration } from "./registration";
export { resolveAnnouncements } from "./registry";
export type { Heard } from "./registry";
export { SHOWCASE, isSimulated, placeExample, showcase, supplyOf } from "./showcase";
export type { CatalogueEntry, MintTally, ShowcaseSpec, SimulatedLaunch } from "./showcase";
