# M4A Prompt Library plan

M4A adds a model-inert prompt content library backed by DSH storage-domain. It stores stable resource ids separately from display names, preserves prompt text exactly, uses revision-fenced writes, leaves dangling future bindings untouched, and does not register prompt content with the model runtime.
