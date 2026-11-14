# Syft's one pin: build.yml's signing job attests each image's SBOMs with Syft at this version, read from here, from the
# workflow's own commit. No workflow writes the version again (test/syft-pin.test.ts). Nothing builds this file.
# Dependabot reads it (.github/dependabot.yml), here rather than under .github/, where its docker updates may not write,
# so its bump of this file is the whole change, and its merge builds and signs with the new Syft (build.yml's paths).
FROM ghcr.io/anchore/syft:v1.57.1@sha256:03215d0e98b661d0ecbc8575dbc14d65be1743b5de5df6410aecb7e80f95b060
