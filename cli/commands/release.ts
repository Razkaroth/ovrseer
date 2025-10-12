import {type Command} from '@razkaroth/quickcli';
import {execSync} from 'child_process';
import {readFileSync, writeFileSync} from 'fs';

function isLocalBehindRemote() {
	try {
		// Ensure we have up-to-date info from the remote
		execSync('git fetch', {stdio: 'ignore'});

		// Get ahead/behind info for current branch
		const output = execSync('git rev-list --left-right --count HEAD...@{u}')
			.toString()
			.trim();

		const [behind, ahead] = output.split('\t').map(Number);

		if (behind && behind > 0) {
			console.log(`⚠️ Local branch is ${behind} commit(s) behind remote.`);
			return true;
		} else {
			console.log('✅ Local branch is up to date with remote.');
			return false;
		}
	} catch (err: any) {
		console.error('Error checking remote status:', err.message);
		return null;
	}
}

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
			patch = true;
		}

		if (!version) {
			const file = readFileSync('package.json').toString();
			const packageJson = JSON.parse(file);
			version = packageJson.version;
			if (patch) {
				console.log('Incrementing patch version');
				version = version.replace(
					/\.\d+$/,
					(match: string) => `.${Number(match.slice(1)) + 1}`,
				);
			} else if (minor) {
				console.log('Incrementing minor version');
				version = version.replace(/\.\d+\.\d+$/, (match: string) => {
					const parts = match.slice(1).split('.');
					return `.${Number(parts[0]) + 1}.0`;
				});
			} else if (major) {
				console.log('Incrementing major version');
				const currentVersion = version.split('.')[0];
				version = `${Number(currentVersion) + 1}.0.0`;
			}
		}

		console.log(`Releasing version ${version}`);

		const packageJsonPaths = [
			'package.json',
			'packages/core/package.json',
			'packages/tui-ink/package.json',
			'packages/example/package.json',
		];

		for (const path of packageJsonPaths) {
			const content = readFileSync(path).toString();
			const packageJson = JSON.parse(content);
			packageJson.version = version;
			writeFileSync(path, JSON.stringify(packageJson, null, '\t') + '\n');
			console.log(`Updated ${path} to version ${version}`);
		}

		execSync('git add package.json packages/*/package.json');
		execSync(`git commit -m "chore(release): v${version}"`);
		execSync(`git tag -a v${version} -m "release v${version}"`);

		console.log(`Created commit and tag v${version}`);
		console.log('Pushing to remote...');

		execSync('git push origin main');
		execSync(`git push origin v${version}`);

		console.log(`Successfully released v${version}`);
	},
};
