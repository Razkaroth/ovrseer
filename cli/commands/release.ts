import {type Command} from '@razkaroth/quickcli';
import {execSync} from 'child_process';
import {readFileSync} from 'fs';
import {isLocalBehindRemote} from '../utils/git-status';

export const command: Command = {
	name: 'release',
	description: 'Releases a new version of the Ovrseer package',
	options: [
		{
			name: 'version',
			description: 'The version to release',
		},
		{
			name: 'patch',
			description: 'Increment the patch version',
			type: 'boolean',
		},
		{
			name: 'minor',
			description: 'Increment the minor version',
			type: 'boolean',
		},
		{
			name: 'major',
			description: 'Increment the major version',
			type: 'boolean',
		},
	],
	handler: async ({version, patch, minor, major}) => {
		// check that we are ahead or on par with remote
		execSync('git fetch');

		const localBranch = execSync('git rev-parse --abbrev-ref HEAD')
			.toString()
			.trim();

		if ('main' !== localBranch) {
			throw new Error('You are not on the main branch');
		}

		const remoteStatus = execSync('git status --porcelain').toString().trim();

		if (remoteStatus !== '') {
			throw new Error('Your local branch is not clean');
		}

		if (isLocalBehindRemote()) {
			throw new Error('Your local branch is behind the remote');
		}

		if (patch && minor && major) {
			throw new Error('You can only increment one version at a time');
		}
		if (!minor && !major) {
			// we default to patch
			patch = true;
		}

		if (!version) {
			// we get the version from the package.json file
			const file = readFileSync('package.json').toString();
			const packageJson = JSON.parse(file);
			version = packageJson.version;
			// we increment the version
			if (patch) {
				console.log('Incrementing patch version');
				version = version.replace(
					/\.\d+$/,
					match => `.${Number(match.slice(1)) + 1}`,
				);
			} else if (minor) {
				console.log('Incrementing minor version');
				version =
					version.replace(
						/\.\d+\.\d+$/,
						match => `.${Number(match.slice(1)) + 1}`,
					) + `.0`;
			} else if (major) {
				console.log('Incrementing major version');
				const currentVersion = version.split('.')[0];
				version = `${Number(currentVersion) + 1}.0.0`;
			}
		}
		console.log(`Releasing version ${version}`);
	},
};
