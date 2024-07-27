import { Codemods } from '@adonisjs/core/ace/codemods'
import Configure from '@adonisjs/core/commands/configure'

import { stubsRoot } from './stubs/main.js'

/**
 * Adds the example route to the routes file
 */
async function defineExampleRoute(command: Configure, codemods: Codemods) {
  const tsMorph = await codemods.getTsMorphProject()
  const routesFile = tsMorph?.getSourceFile(command.app.makePath('./start/routes.ts'))

  if (!routesFile) {
    return command.logger.warning('Unable to find the routes file')
  }

  const action = command.logger.action('update start/routes.ts file')
  try {
    routesFile?.addStatements((writer) => {
      writer.writeLine(`router.on('/').renderInertia('home', { version: 6 })`)
    })

    await tsMorph?.save()
    action.succeeded()
  } catch (error) {
    codemods.emit('error', error)
    action.failed(error.message)
  }
}

export async function configure(command: Configure) {
  let ssr: boolean | undefined = command.parsedFlags.ssr
  let shouldInstallPackages: boolean | undefined = command.parsedFlags.install

  /**
   * Prompt to select if SSR is needed when `--ssr` flag is not passed
   */
  if (ssr === undefined) {
    ssr = await command.prompt.confirm('Do you want to use server-side rendering?', {
      name: 'ssr',
    })
  }

  const codemods = await command.createCodemods()

  /**
   * Publish provider
   */
  await codemods.updateRcFile((rcFile) => {
    rcFile.addProvider('@adonisjs/inertia/inertia_provider')
  })

  /**
   * Add Inertia middleware
   */
  await codemods.registerMiddleware('server', [
    { path: '@adonisjs/inertia/inertia_middleware', position: 'after' },
  ])

  await codemods.makeUsingStub(stubsRoot, 'config.stub', {
    ssr,
    ssrEntrypoint: 'inertia/app/ssr.tsx',
  })
  await codemods.makeUsingStub(stubsRoot, `app.css.stub`, {})
  await codemods.makeUsingStub(stubsRoot, `kaioken/root.edge.stub`, {})
  await codemods.makeUsingStub(stubsRoot, `kaioken/tsconfig.json.stub`, {})
  await codemods.makeUsingStub(stubsRoot, `kaioken/app.tsx.stub`, { ssr })
  await codemods.makeUsingStub(stubsRoot, `kaioken/home.tsx.stub`, {})
  await codemods.makeUsingStub(stubsRoot, `kaioken/errors/not_found.tsx.stub`, {})
  await codemods.makeUsingStub(stubsRoot, `kaioken/errors/server_error.tsx.stub`, {})
  if (ssr) {
    await codemods.makeUsingStub(stubsRoot, `kaioken/ssr.tsx.stub`, {})
  }

  /**
   * Register the adonisjs plugin in vite config
   */
  const adonisPluginCall = `adonisjs({ entrypoints: ['inertia/app/app.tsx'], reload: ['resources/views/**/*.edge', 'inertia/**/*.tsx'] })`
  await codemods.registerVitePlugin(adonisPluginCall, [
    { isNamed: false, module: '@adonisjs/vite/client', identifier: 'adonisjs' },
  ])

  /**
   * Register the inertia plugin in vite config
   */
  const inertiaPluginCall = ssr
    ? `inertia({ ssr: { enabled: true, entrypoint: 'inertia/app/ssr.tsx' } })`
    : `inertia({ ssr: { enabled: false } })`

  await codemods.registerVitePlugin(inertiaPluginCall, [
    { isNamed: false, module: '@adonisjs/inertia/client', identifier: 'inertia' },
  ])

  /**
   * Register the adapter plugin in vite config
   */
  await codemods.registerVitePlugin('kaioken()', [
    { isNamed: false, module: 'vite-plugin-kaioken', identifier: 'kaioken' },
  ])

  await defineExampleRoute(command, codemods)

  /**
   * Install packages
   */
  const pkgToInstall: {
    name: string
    isDevDependency: boolean
  }[] = [
    { isDevDependency: true, name: 'kaioken' },
    { isDevDependency: true, name: 'vite-plugin-kaioken' },
    { isDevDependency: true, name: 'inertia-kaioken-adapter' },
  ]

  /**
   * Prompt when `install` or `--no-install` flags are
   * not used
   */
  if (shouldInstallPackages === undefined) {
    shouldInstallPackages = await command.prompt.confirm(
      `Do you want to install dependencies ${pkgToInstall.map((pkg) => pkg.name).join(', ')}?`,
      { name: 'install' }
    )
  }

  if (shouldInstallPackages) {
    await codemods.installPackages(pkgToInstall)
  } else {
    await codemods.listPackagesToInstall(pkgToInstall)
  }
}
