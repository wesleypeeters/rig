export type Access = "none" | "internal" | "local" | "private" | "public";

export type RouteConfig = { access: Access; target: URL };

export type Routes = Record<string, Record<string, RouteConfig>>;

export type StackExtension = {
	name: string;
	routes: Routes;
};

export type StackYml = Stack & { "x-rig": StackExtension };

export type Port = {
	mode?: string;
	target: number;
	published: number;
	protocol?: string;
};

export type Volume = {
	type?: string;
	source: string;
	target: string;
};

export type Service = {
	env_file?: string[];
	build?: string;
	configs?: Record<string, string>;
	deploy?: { replicas: number };
	environment?: Record<string, string | null>;
	image: string;
	ports?: Port[];
	volumes?: Volume[];
	cap_add?: string[];
	privileged?: boolean;
};

export type FileRef = {
	file: string;
	name: string;
};

export type Stack = {
	version?: string;
	services: Record<string, Service>;
	networks?: Record<string, unknown>;
	secrets?: Record<string, FileRef>;
	configs?: Record<string, FileRef>;
	volumes?: Record<string, unknown>;
};
