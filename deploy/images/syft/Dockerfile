# Syft's one pin: build.yml's signing job attests each image's SBOMs with Syft at this version, read from here, from the
# workflow's own commit. No workflow writes the version again (test/syft-pin.test.ts). Nothing builds this file.
# Dependabot reads it (.github/dependabot.yml), here rather than under .github/, where its docker updates may not write,
# so its bump of this file is the whole change, and its merge builds and signs with the new Syft (build.yml's paths).
FROM ghcr.io/anchore/syft:v1.57.2@sha256:e97e20b6e6d1699c60296b66ab337941724f9bd06ac279d893eda89601fc4b2a
