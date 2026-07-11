import type { Project } from "@railway/cli";
const project: Project = {
  build: {
    builder: "DOCKERFILE",
    dockerfilePath: "Dockerfile",
  },
  deploy: {
    numReplicas: 1,
    restartPolicyType: "ON_FAILURE",
    restartPolicyMaxRetries: 10,
  },
};
export default project;
