# syntax=docker/dockerfile:1
ARG GO_VERSION=1.27.1
FROM golang:${GO_VERSION}-alpine AS build
ARG SERVICE
WORKDIR /src/go
COPY go/go.mod go/go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY go/ ./
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOWORK=off go build -trimpath -o /out/service ./cmd/${SERVICE}

FROM gcr.io/distroless/static-debian13:nonroot
COPY --from=build /out/service /service
HEALTHCHECK --interval=2s --timeout=3s --start-period=1s --retries=15 CMD ["/service", "-healthcheck"]
ENTRYPOINT ["/service"]
