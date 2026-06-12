// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightImageZoom from 'starlight-image-zoom';
import starlightLlmsTxt from 'starlight-llms-txt';

// https://astro.build/config
export default defineConfig({
	// Update this if you add a custom domain to GitHub Pages
	site: 'https://getember.tv',
	base: '/',
	integrations: [
		starlight({
			title: 'Ember',
			logo: {
				src: './src/assets/logo.svg',
				replacesTitle: true,
			},
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/knackstedt/ember' },
			],
			customCss: [
				'./src/styles/custom.css',
			],
			sidebar: [
				{
					label: 'Getting Started',
					items: [
						{ label: 'Introduction', slug: 'getting-started/introduction' },
						{ label: 'Installation', slug: 'getting-started/installation' },
						{ label: 'Development', slug: 'getting-started/development' },
					],
				},
				{
					label: 'Guides',
					items: [
						{ label: 'Controllers & Input', slug: 'guides/controllers' },
						{ label: 'GameCube & Wii Emulation', slug: 'guides/emulation' },
						{ label: 'Windows Games via Wine', slug: 'guides/wine' },
						{ label: 'Media Setup', slug: 'guides/media' },
					],
				},
				{
					label: 'Architecture',
					items: [
						{ label: 'Shared Frame Buffer', slug: 'architecture/shared-frame-buffer' },
						{ label: 'Video Decoder', slug: 'architecture/video-decoder' },
					],
				},
				{
					label: 'Reference',
					items: [
						{ label: 'System Dependencies', slug: 'reference/dependencies' },
						{ label: 'Keyboard Shortcuts', slug: 'reference/shortcuts' },
						{ label: 'Troubleshooting', slug: 'reference/troubleshooting' },
					],
				},
			],
			editLink: {
				baseUrl: 'https://github.com/knackstedt/ember/edit/main/website/',
			},
			lastUpdated: true,
			plugins: [
				starlightImageZoom({ showCaptions: true }),
				starlightLlmsTxt({
					projectName: 'Ember',
					description: 'A home theatre application for managing and playing media and games on a big screen',
					promote: ['index*']
				}),
			]
		}),
	],
});
