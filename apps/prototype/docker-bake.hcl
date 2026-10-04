variable "TAG" {
  default = "dev"
}

group "default" {
  targets = ["broker", "relay", "euserver", "skeletonphone"]
}

target "service" {
  context    = "."
  dockerfile = "docker/Dockerfile.go"
  matrix = {
    svc = ["broker", "relay", "euserver", "skeletonphone"]
  }
  name = svc
  args = {
    SERVICE = svc
  }
  tags   = ["pomoc/${svc}:${TAG}"]
  output = ["type=docker"]
}
