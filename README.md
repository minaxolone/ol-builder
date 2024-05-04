This repository contains the scripts to build [The Libra Framework](https://github.com/0LNetworkCommunity/libra-framework)
docker image in Kubernetes with [kaniko](https://github.com/GoogleContainerTools/kaniko).

## Releases

[9e9ecb5](https://github.com/users/minaxolone/packages/container/libra/211951858?tag=9e9ecb52f38d524e33d298111aed81eb9cf07f7d) - [`[rust] build dependency fixes (#240)`](https://github.com/0LNetworkCommunity/libra-framework/commit/9e9ecb52f38d524e33d298111aed81eb9cf07f7d)

## Usage

Make sure you have access to a Kubernetes cluster and have kubectl installed.
You will also need [yarn](https://yarnpkg.com/), Node.js (v20.12.2) and [direnv](https://direnv.net/).

[Generate an new Github access token](https://github.com/settings/tokens/new) with the `write:packages` scope.
Copy and edit the file `.envrc.example` to `.envrc` with your Github credentials. Run `direnv allow .` to set the environment variables.

```sh
nvm use
yarn install
yarn start
```